import { describe, it, expect } from "vitest";
import { hasError } from "../../utils/diagnostics.js";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { byCodePoint } from "../../utils/sort.js";
import { schemasOf } from "../../utils/document.js";

/**
 * The emitted document must not depend on the order declarations appear in.
 *
 * The schema builder decides between inlining a shape and registering it
 * as a component, and that decision reacts to what it has already seen.
 * A shape inlined at one site is promoted to a component when a second
 * site refers to it. Reordering the sources therefore changes what the
 * builder meets first, while the program means the same thing either
 * way.
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
   * Swapping two messages leaves the document unchanged.
   *
   * A shape with no name of its own is inlined at the site that reaches it
   * first. A second site that reaches it promotes it to a component. For
   * example:
   *
   *   model Env<T> { data: T; }
   *   alias E2 = Env<{ p2: string }>;
   *   @AsyncAPI.message model Alpha { f2: E2; }
   *   @AsyncAPI.message model Beta  { f2: E2; }
   *
   * Promotion rewrites both the first site's inline copy and the second
   * site's use into a reference, because the copy and the promoted
   * component are one object. Reordering the two messages must not change
   * which site is first. So the output must not change either.
   *
   * A plain named model is always registered, so it never meets the
   * promotion rule. The alias is what makes both messages reach one
   * instantiation. Writing the instantiation out twice would instead create
   * two separate types.
   */
  it("emits the same document when the two messages swap places", async () => {
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

          const a = await emitDocumentWithDiagnostics(`${head}\n${alpha}\n${beta}`);
          const b = await emitDocumentWithDiagnostics(`${head}\n${beta}\n${alpha}`);

          fc.pre(a.doc !== null && b.doc !== null);
          fc.pre(!hasError(a.diagnostics));
          fc.pre(!hasError(b.diagnostics));

          expect(normalise(a.doc)).toEqual(normalise(b.doc));
        },
      ),
      { numRuns: 80, seed: 20260815 },
    );
  });

  /**
   * Rotating the message declarations must not change the document, once
   * key order is normalised away.
   *
   * The property above swaps two messages that share one shape. This one
   * rotates three messages whose payload shapes are disjoint, so the
   * promote-on-second-use asymmetry the swap property records cannot fire.
   * Every shape is used twice inside its own message, so the builder still
   * runs its promote path. The promotion stays symmetric under rotation,
   * because both uses move together.
   *
   * A message declaration is the unit the emitter traverses, so moving one
   * changes the order the builder meets shapes in. An iteration order taken
   * from object identity would show up here as a content difference. So
   * would a component name taken from a creation-order counter. The
   * comparison checks for exactly that difference.
   *
   * The comparison sorts keys first. Key order in `components.schemas`
   * follows declaration order and is expected to move; that movement is
   * counted as evidence of a different traversal, not asserted on.
   *
   * The source keeps the alias-to-instantiation shape the property above
   * uses, not plain named models. A named model is always registered as a
   * component, so a plain-model generator would never reach the
   * promote-on-second-use rule.
   *
   * Three counters below check reachability: runs whose rotation moved a
   * declaration, runs whose `components.schemas` key order moved, and runs
   * carrying a promoted `Env...` component. An offset that is a multiple of
   * three moves nothing. It would compare a document with itself, unnoticed.
   * All three counters guard against a generator or emitter that silently
   * stopped doing its job.
   */
  it("emits the same document when the message declarations rotate", async () => {
    let permuted = 0;
    let keyOrderMoved = 0;
    let promoted = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 0, max: 8 }), { minLength: 3, maxLength: 6 }),
        leafType,
        fc.integer({ min: 0, max: 1000 }),
        async (ids, type, offset) => {
          // Three disjoint groups. No shape is shared between two messages,
          // so the recorded promote-on-second-use defect cannot fire.
          const groups: number[][] = [[], [], []];
          ids.forEach((id, index) => groups[index % 3].push(id));

          const aliases = ids.map(
            (id) => `alias E${String(id)} = Env<{ p${String(id)}: ${type} }>;`,
          );
          // Each id is used twice inside its own message. The second use is
          // what promotes the anonymous shape to a component.
          const fieldsOf = (group: number[]) =>
            group
              .map((id) => `f${String(id)}: E${String(id)}; g${String(id)}: E${String(id)};`)
              .join(" ");
          const messages = ["Alpha", "Beta", "Gamma"].map(
            (name, index) => `@AsyncAPI.message model ${name} { ${fieldsOf(groups[index])} }`,
          );

          // A rotation, not a shuffle. It is cheap to state, it reproduces
          // from the drawn offset alone, and it moves every message at once.
          const cut = offset % messages.length;
          const rotated = [...messages.slice(cut), ...messages.slice(0, cut)];
          const moved = rotated.join("\n") !== messages.join("\n");
          if (moved) permuted++;

          const head = "model Env<T> { data: T; }";
          const a = await emitDocumentWithDiagnostics([head, ...aliases, ...messages].join("\n"));
          const b = await emitDocumentWithDiagnostics([head, ...aliases, ...rotated].join("\n"));

          fc.pre(a.doc !== null && b.doc !== null);
          fc.pre(!hasError(a.diagnostics));
          fc.pre(!hasError(b.diagnostics));

          const keysA = Object.keys(schemasOf(a.doc));
          const keysB = Object.keys(schemasOf(b.doc));
          if (keysA.join(",") !== keysB.join(",")) keyOrderMoved++;
          // Alpha, Beta and Gamma are the declared messages. Any other key
          // is a shape that was inlined first and promoted on its second
          // use.
          const names = new Set(["Alpha", "Beta", "Gamma"]);
          if (keysA.some((key) => !names.has(key))) promoted++;

          expect(normalise(a.doc)).toEqual(normalise(b.doc));
        },
      ),
      { numRuns: 120, seed: 20260815 },
    );

    // A run that never moved a declaration would compare a document with
    // itself. A key order that never moved would mean the emitter never saw
    // a different traversal. A run that never promoted would leave the
    // builder's promote-path state unwatched.
    expect(permuted).toBeGreaterThan(0);
    expect(keyOrderMoved).toBeGreaterThan(0);
    expect(promoted).toBeGreaterThan(0);
  });
});
