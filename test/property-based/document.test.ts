import { describe, it, expect } from "vitest";
import { hasError } from "../utils/diagnostics.js";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../utils/test-host.js";
import { resolveRef } from "../utils/json-pointer.js";
import { isSafeComponentsKey } from "#core/naming.js";
import { schemasOf } from "../utils/document.js";
import { referencesIn } from "../utils/references.js";

/**
 * Properties of a whole emitted document.
 *
 * The tests beside this one each drive one shape through the emitter. These
 * generate shapes instead, and assert what has to hold for every document
 * the emitter is willing to produce. An emitter may reject a program, so
 * every property here is conditional: it only claims something once the
 * emitter has answered with a document and no error.
 */

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
 * A plain identifier lies inside the Components Object charset already, so
 * `sanitizeDeclarationName` returns it unchanged. A generator drawing plain
 * names alone would never run the escaping code. The backticked forms carry
 * `/`, `~`, and a space, which the sanitizer must encode. The `Sep`-spelling
 * forms collide with the sanitizer's own escape marker.
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
   * Reachability: the run counts documents emitted, programs refused, and
   * keys the sanitizer rewrote. `fc.pre` retries a refused program, so the
   * emitted and refused counts do not add up to `numRuns`. Without the
   * rewritten-key counter the charset claim could pass on plain identifiers
   * alone, never running the escaping code.
   *
   * No collected `$ref` carries an RFC 6901 escape, because the sanitizer
   * removes `/` and `~` from a key before building a `$ref`. The unescaping
   * in `resolveRef` stays untested here, in case a future key keeps those
   * characters.
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
          const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
            ${models}
            @AsyncAPI.message model Root { ${fields} }
          `);

          // The emitter is allowed to refuse. Two of these name sets do
          // collide after sanitizing, and that is reported as an error. The
          // claim starts once the emitter has answered with a document.
          fc.pre(doc !== null && !hasError(diagnostics));

          const keys = Object.keys(schemasOf(doc));
          for (const key of keys) {
            expect(isSafeComponentsKey(key)).toBe(true);
          }
          let rewrittenHere = 0;
          for (const name of new Set(names.map(declaredText))) {
            if (!keys.includes(name)) rewrittenHere++;
          }
          rewrittenKeys += rewrittenHere;
          if (rewrittenHere > 0) rewrittenDocs++;
          for (const ref of referencesIn(doc)) {
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
  });

  /**
   * Distinct declarations must stay distinct in the output.
   *
   * The key sanitizer can map two different names onto one key. The registry
   * then reports `duplicate-schema-key` at error severity, so this property
   * accepts a reported error as a valid answer and only refuses silence.
   *
   * Reporting is not refusing: the emitter still returns a document, with one
   * entry under the shared key describing only one of the two declarations. A
   * real `tsp compile` stops on the error and writes nothing, which is what
   * keeps that document away from a reader. So this property holds the
   * registry to that job: losing the report would turn a build failure into a
   * wrong document.
   *
   * Reachability: `checked` counts runs that reach the length assertion,
   * `duplicates` counts runs that took the early return on a reported error.
   * Both are asserted, so neither path can go quietly unreached.
   */
  it("never merges two declarations into one component without saying so", async () => {
    let checked = 0;
    let duplicates = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(trickyName, { minLength: 2, maxLength: 4 }),
        // Two declarations can still resolve to one key, no longer through
        // the marker since the sanitizer now keeps those apart. A shared
        // `@friendlyName` is the remaining way, so the generator makes one
        // sometimes, or the reported branch below is never reached.
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
          const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
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

          fc.pre(!hasError(diagnostics));

          // Root plus one component for each declared model.
          const keys = Object.keys(schemasOf(doc));
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
  });
});
