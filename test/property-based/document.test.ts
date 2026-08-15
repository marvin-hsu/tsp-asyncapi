/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";
import { isSafeComponentsKey } from "../../src/builders/schemas/schema-naming.js";

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

/** Resolves a local JSON Pointer, undoing the RFC 6901 escapes. */
function resolveRef(doc: unknown, ref: string): unknown {
  const steps = ref
    .slice(2)
    .split("/")
    .map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~"));
  let node: unknown = doc;
  for (const step of steps) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[step];
  }
  return node;
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

describe("Integration: emitted document properties", () => {
  it("emits keys inside the charset, and every $ref resolves", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(plainName, { minLength: 1, maxLength: 4 }),
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

          // The emitter is allowed to refuse. The claim starts once it has
          // answered with a document.
          fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

          for (const key of Object.keys(doc.components?.schemas ?? {})) {
            expect(isSafeComponentsKey(key)).toBe(true);
          }
          for (const ref of collectRefs(doc)) {
            // A reference that resolves to nothing leaves the reader with a
            // message it cannot describe.
            expect(resolveRef(doc, ref)).toBeDefined();
          }
        },
      ),
      { numRuns: 120 },
    );
  }, 120000);

  /**
   * Distinct declarations must stay distinct in the output.
   *
   * The key sanitizer can map two different names onto one key, and
   * `` `/` `` against `Sep47` was measured doing exactly that. The registry
   * catches it today and reports `duplicate-schema-key`, so this property
   * accepts an error and refuses only silence.
   *
   * That means the property cannot fail from the sanitizer defect while the
   * registry keeps reporting. It is here to hold the registry to that job:
   * a reader who sees one schema where the program declared two has no sign
   * that anything was lost. The names include the shapes the sanitizer
   * treats specially, since a generic identifier never reaches them.
   */
  it("never merges two declarations into one component without saying so", async () => {
    const trickyName = fc.oneof(
      plainName,
      fc.constantFrom("Sep47", "Sep126", "Sep32", "SepSep47", "Sep0"),
      fc.constantFrom("`/`", "`~`", "`a/b`", "`a~b`", "`x y`"),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(trickyName, { minLength: 2, maxLength: 4 }),
        async (names) => {
          const models = names.map((n) => `model ${n} { v: string; }`).join("\n");
          const fields = names.map((n, i) => "r" + String(i) + ": " + n + ";").join(" ");
          const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
            ${models}
            @AsyncAPI.message model Root { ${fields} }
          `);

          fc.pre(doc !== null);

          const reported = diagnostics.some(
            (d) => d.severity === "error" && d.code.includes("duplicate-schema-key"),
          );
          if (reported) return;

          fc.pre(!diagnostics.some((d) => d.severity === "error"));

          // Root plus one component for each declared model.
          const keys = Object.keys(doc.components?.schemas ?? {});
          expect(keys).toHaveLength(names.length + 1);
        },
      ),
      { numRuns: 150, seed: 20260815 },
    );
  }, 120000);
});
