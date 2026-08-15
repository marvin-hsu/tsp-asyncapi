import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";
import { byCodePoint } from "../utils/sort.js";

/**
 * The emitted document must not depend on the order declarations appear in.
 *
 * The schema builder decides between inlining a shape and registering it as
 * a component, and that decision reacts to what it has already seen: a
 * shape inlined at one site is promoted to a component when a second site
 * refers to it. Reordering the sources therefore changes what the builder
 * meets first, while the program means the same thing either way.
 *
 * The suite already pins a few orders by hand, one test per order. Those
 * cover the orders somebody thought of. This searches instead.
 */

/** Sorts object keys throughout, so map insertion order stops mattering. */
function normalise(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalise);
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(node).sort(byCodePoint)) {
      out[key] = normalise((node as Record<string, unknown>)[key]);
    }
    return out;
  }
  return node;
}

const leafType = fc.constantFrom("string", "int32", "boolean", "float64");

describe("Property: order independence", () => {
  /**
   * A known defect, recorded rather than hidden.
   *
   * A shape with no name of its own is inlined at the site that reaches it
   * first, and promoted to a component when a second site reaches it. The
   * promotion adds the component and points the second site at it. It does
   * not go back and replace the copy already written into the first site.
   *
   * Swapping two messages therefore moves which one holds the copy:
   *
   *   model Env<T> { data: T; }
   *   alias E2 = Env<{ p2: string }>;
   *   @AsyncAPI.message model Alpha { f2: E2; }
   *   @AsyncAPI.message model Beta  { f2: E2; }
   *
   * Whichever message is declared first carries the whole shape inline, and
   * the other carries `$ref` to `components.schemas`. Both documents also
   * hold the component, so one body is emitted twice: once as a component
   * and once expanded inside a message. The two copies can drift, and a
   * reader has no sign they are the same shape. Reordering two declarations
   * for tidiness also rewrites the output.
   *
   * `buildDeclarationRef` already prevents this for a message payload
   * itself. The gap is a shape shared *inside* payloads.
   *
   * A plain named model is always registered, so it never meets the
   * promotion rule. The alias is what makes both messages reach one
   * instantiation, and writing the instantiation out twice would instead
   * create two separate types.
   *
   * `it.fails` records the defect without turning the suite red. The seed
   * is fixed so the counter-example does not move. Fixing the builder makes
   * this test fail, which is the signal to drop `.fails`.
   */
  it.fails(
    "does not yet emit the same document when the two messages swap places",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uniqueArray(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 3 }),
          fc.uniqueArray(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 3 }),
          leafType,
          async (leftIds, rightIds, type) => {
            const shared = [...new Set([...leftIds, ...rightIds])].sort((x, y) => x - y);
            const aliases = shared
              .map((id) => `alias E${String(id)} = Env<{ p${String(id)}: ${type} }>;`)
              .join("\n");
            const fieldsOf = (ids: number[]) =>
              ids.map((id) => "f" + String(id) + ": E" + String(id) + ";").join(" ");

            const alpha = `@AsyncAPI.message model Alpha { ${fieldsOf(leftIds)} }`;
            const beta = `@AsyncAPI.message model Beta { ${fieldsOf(rightIds)} }`;
            const head = `model Env<T> { data: T; }\n${aliases}`;

            const a = await emitAsyncAPIWithDiagnostics(`${head}\n${alpha}\n${beta}`);
            const b = await emitAsyncAPIWithDiagnostics(`${head}\n${beta}\n${alpha}`);

            fc.pre(a.doc !== null && b.doc !== null);
            fc.pre(!a.diagnostics.some((d) => d.severity === "error"));
            fc.pre(!b.diagnostics.some((d) => d.severity === "error"));

            expect(normalise(a.doc)).toEqual(normalise(b.doc));
          },
        ),
        { numRuns: 80, seed: 20260815 },
      );
    },
    180000,
  );

  /**
   * Emitting the same program twice must give the same bytes.
   *
   * The builder keeps its state in maps and sets. A key order that leaked
   * from object identity rather than from source order would show up here
   * as a document that differs between runs of one unchanged program.
   */
  it("emits the same document twice for one program", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 4 }),
        leafType,
        async (ids, type) => {
          const models = ids.map((id) => `model S${String(id)} { v: ${type}; }`).join("\n");
          const fields = ids.map((id) => "f" + String(id) + ": S" + String(id) + ";").join(" ");
          const source = `${models}\n@AsyncAPI.message model Root { ${fields} }`;

          const a = await emitAsyncAPIWithDiagnostics(source);
          const b = await emitAsyncAPIWithDiagnostics(source);

          fc.pre(a.doc !== null && b.doc !== null);
          // Key order is compared as well here, so no normalisation.
          expect(JSON.stringify(a.doc)).toBe(JSON.stringify(b.doc));
        },
      ),
      { numRuns: 60 },
    );
  }, 180000);
});
