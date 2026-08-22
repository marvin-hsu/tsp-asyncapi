/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";
import { resolveRef } from "../utils/json-pointer.js";
import { isSafeComponentsKey } from "../../src/naming.js";

/**
 * Properties of a whole emitted document.
 *
 * The tests beside this one each drive one shape through the emitter. These
 * generate shapes instead, and assert what has to hold for every document
 * the emitter is willing to produce. An emitter may reject a program, so
 * every property here is conditional: it only claims something once the
 * emitter has answered with a document and no error.
 */

/** Collects every `$ref` string anywhere in the document. */
function collectRefs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
    return found;
  }
  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") found.push(value);
      else collectRefs(value, found);
    }
  }
  return found;
}

/** A field type that needs no other declaration. */
const leafType = fc.constantFrom(
  "string",
  "int32",
  "float64",
  "boolean",
  "utcDateTime",
  "bytes",
  "string[]",
  "Record<string>",
);

/** A TypeSpec identifier that needs no backticks. */
const plainName = fc
  .tuple(
    fc.constantFrom("A", "B", "C", "M", "N", "Order", "Item", "Ev"),
    fc.integer({ min: 0, max: 40 }),
  )
  .map(([stem, n]) => stem + String(n));

/**
 * A declaration name that reaches the key sanitizer.
 *
 * A plain identifier lies entirely inside the Components Object charset, so
 * `sanitizeDeclarationName` returns it unchanged on its first line. A
 * generator of plain identifiers alone therefore never runs the escaping
 * code, and a charset claim over its output would hold no matter what that
 * code did. The backticked forms carry `/`, `~`, and a space, which the
 * sanitizer must encode. The `Sep`-spelling forms are the payload text that
 * collides with the sanitizer's own escape marker.
 */
const trickyName = fc.oneof(
  plainName,
  fc.constantFrom("Sep47", "Sep126", "Sep32", "SepSep47", "Sep0"),
  fc.constantFrom("`/`", "`~`", "`a/b`", "`a~b`", "`x y`"),
);

/** Strips the backticks a quoted TypeSpec identifier is written with. */
function declaredText(name: string): string {
  return name.replaceAll("`", "");
}

describe("Integration: emitted document properties", () => {
  /**
   * Two claims about any document the emitter agrees to produce. Every
   * `components.schemas` key lies inside the Components Object charset, and
   * every `$ref` in the document resolves to a node.
   *
   * Reachability. The run is instrumented for documents emitted, programs
   * refused, documents holding at least one key the sanitizer rewrote, keys
   * rewritten, and `$ref` strings collected and resolved. A refused program
   * is retried by `fc.pre`, so the emitted and refused counts do not add up
   * to `numRuns`.
   *
   * The rewritten-key counter is what makes the charset claim mean anything.
   * An earlier version of this property drew plain identifiers only, and
   * rewrote no key at all: the charset assertion passed without ever running
   * the escaping code.
   *
   * No collected `$ref` carries an RFC 6901 escape, because the sanitizer
   * encodes `/` and `~` out of the key before a `$ref` is ever built. The
   * unescaping in `resolveRef` is therefore untested by this property. It
   * stays there so a future key that does keep those characters resolves.
   *
   * Both rewrite counters are asserted below, the per-document one and the
   * per-key one. So both recorded numbers stay honest if the generator or
   * the sanitizer moves.
   */
  it("emits keys inside the charset, and every $ref resolves", async () => {
    let rewrittenKeys = 0;
    let rewrittenDocs = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(trickyName, { minLength: 1, maxLength: 4 }),
        fc.array(leafType, { minLength: 1, maxLength: 4 }),
        async (names, types) => {
          const models = names
            .map((name, i) => {
              const optional = i % 2 === 0 ? "" : "?";
              const fieldList = types
                .map((t, j) => "f" + String(j) + optional + ": " + t + ";")
                .join(" ");
              return `model ${name} { ${fieldList} }`;
            })
            .join("\n");
          const fields = names.map((n, i) => "r" + String(i) + ": " + n + ";").join(" ");
          const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
            ${models}
            @AsyncAPI.message model Root { ${fields} }
          `);

          // The emitter is allowed to refuse. Two of these name sets do
          // collide after sanitizing, and that is reported as an error. The
          // claim starts once the emitter has answered with a document.
          fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

          const keys = Object.keys(doc.components?.schemas ?? {});
          for (const key of keys) {
            expect(isSafeComponentsKey(key)).toBe(true);
          }
          let rewrittenHere = 0;
          for (const name of new Set(names.map(declaredText))) {
            if (!keys.includes(name)) rewrittenHere++;
          }
          rewrittenKeys += rewrittenHere;
          if (rewrittenHere > 0) rewrittenDocs++;
          for (const ref of collectRefs(doc)) {
            // A reference that resolves to nothing leaves the reader with a
            // message it cannot describe.
            expect(resolveRef(doc, ref)).toBeDefined();
          }
        },
      ),
      { numRuns: 120, seed: 20260815 },
    );

    // A run in which no key was ever rewritten would prove nothing about
    // the charset, since an unrewritten key was already inside it. Both
    // counters are asserted, so both recorded numbers have a live check.
    expect(rewrittenKeys).toBeGreaterThan(0);
    expect(rewrittenDocs).toBeGreaterThan(0);
  }, 120000);

  /**
   * Distinct declarations must stay distinct in the output.
   *
   * The key sanitizer can map two different names onto one key, and
   * `` `/` `` against `Sep47` was measured doing exactly that. The registry
   * reports `duplicate-schema-key` at error severity when it happens, so
   * this property treats a reported error as an acceptable answer and only
   * refuses silence.
   *
   * Reporting is not the same as refusing. The emitter still returns a
   * document, and that document holds one entry under the shared key with
   * one of the two bodies, so the other declaration is described by the
   * wrong shape. A real `tsp compile` stops on the error and writes no
   * file, which is what keeps that document away from readers.
   *
   * So this property cannot fail from the sanitizer defect while the
   * registry keeps reporting. It is here to hold the registry to that job:
   * losing the report would turn a build failure into a wrong document. The
   * names include the shapes the sanitizer treats specially, since a
   * generic identifier never reaches them.
   *
   * Reachability. Two counters split the runs: those that reported
   * `duplicate-schema-key`, and those that reached the length assertion.
   *
   * `checked` counts the runs that reach the length assertion. `duplicates`
   * counts the runs that took the early return. Both are asserted after the
   * search. Without `checked` the property has a vacuous mode. A generator
   * that drifted until every draw collided would take the early return every
   * time, the assertion would never run, and the test would still be green.
   * Without `duplicates` the sanitizer collision the property watches for
   * could stop being drawn at all, unnoticed.
   */
  it("never merges two declarations into one component without saying so", async () => {
    let checked = 0;
    let duplicates = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(trickyName, { minLength: 2, maxLength: 4 }),
        // Two declarations that resolve to one key are still possible, and
        // no longer through the marker: the sanitizer keeps those apart now.
        // A shared `@friendlyName` is the remaining way, so the generator
        // makes one sometimes. Without it the reported branch below is never
        // entered and its counter assertion fails, which is the counter
        // doing its job.
        fc.boolean(),
        async (names, collide) => {
          const models = names
            .map((n, i) =>
              collide && i < 2
                ? `@friendlyName("Shared") model ${n} { v: string; }`
                : `model ${n} { v: string; }`,
            )
            .join("\n");
          const fields = names.map((n, i) => "r" + String(i) + ": " + n + ";").join(" ");
          const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
            ${models}
            @AsyncAPI.message model Root { ${fields} }
          `);

          fc.pre(doc !== null);

          const reported = diagnostics.some(
            (d) => d.severity === "error" && d.code.includes("duplicate-schema-key"),
          );
          if (reported) {
            duplicates++;
            return;
          }

          fc.pre(!diagnostics.some((d) => d.severity === "error"));

          // Root plus one component for each declared model.
          const keys = Object.keys(doc.components?.schemas ?? {});
          checked++;
          expect(keys).toHaveLength(names.length + 1);
        },
      ),
      { numRuns: 150, seed: 20260815 },
    );

    // A run that reported a duplicate every time would assert nothing. The
    // duplicate count is asserted too, so the reported path stays reached.
    expect(checked).toBeGreaterThan(0);
    expect(duplicates).toBeGreaterThan(0);
  }, 120000);
});
