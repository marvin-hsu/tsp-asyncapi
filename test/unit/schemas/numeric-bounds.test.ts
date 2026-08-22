import { describe, it, expect } from "vitest";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { schemasOf } from "../../utils/document.js";
import { diagnosticsWith } from "../../utils/diagnostics.js";

/**
 * Which numeric bounds reach the document, and which are reported instead.
 *
 * The emitter's own decision here is one line: it asks the compiler's
 * `Numeric` for a JavaScript number and reports when the answer is `null`.
 * So the code cannot see the value at all — it sees only whether that call
 * succeeded — and every value on one side of the answer takes the identical
 * path.
 *
 * That makes the whole space two classes with one boundary between them, and
 * the boundary belongs to the compiler rather than to us: `asNumber()` returns
 * `null` exactly where a JavaScript number stops being exact. So the cases are
 * the boundary and its neighbours, written out. A property drew a hundred and
 * fifty values from inside one class, which walks one branch a hundred and
 * fifty times.
 *
 * `int64` is the declared type throughout, so every literal below is legal
 * TypeSpec: the question is never whether the compiler accepts it, only
 * whether it can hand us a number.
 */
describe("Unit: numeric bounds at the safe-integer boundary", () => {
  /** Compiles one scalar property carrying one constraint. */
  async function emitConstraint(decorator: "minValue" | "maxValue", literal: string) {
    return emitDocumentWithDiagnostics(`
      @AsyncAPI.message
      model Root {
        @${decorator}(${literal})
        v: int64;
      }
    `);
  }

  const KEYWORD = { minValue: "minimum", maxValue: "maximum" } as const;

  /**
   * Reads the emitted bound, or `undefined` when the emitter dropped it.
   *
   * The keyword is chosen by the decorator, so it is read by name, and
   * `SchemaObject` names its keywords as fields rather than through an index
   * signature.
   */
  async function boundOf(decorator: "minValue" | "maxValue", literal: string) {
    const { doc, diagnostics } = await emitConstraint(decorator, literal);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const schema = schemasOf(doc).Root.properties?.v as Record<string, unknown> | undefined;
    return { emitted: schema?.[KEYWORD[decorator]], diagnostics };
  }

  const DECORATORS = ["minValue", "maxValue"] as const;

  /** Exactly representable: the bound has to arrive unchanged. */
  const EXACT = [
    { kind: "zero", literal: "0" },
    { kind: "one", literal: "1" },
    { kind: "minus one", literal: "-1" },
    { kind: "the int32 boundary", literal: "2147483647" },
    { kind: "past the int32 boundary", literal: "2147483648" },
    { kind: "the largest safe integer", literal: "9007199254740991" },
    { kind: "the most negative safe integer", literal: "-9007199254740991" },
  ];

  /** Past the safe range: the bound has to be reported and dropped. */
  const UNREPRESENTABLE = [
    { kind: "two past the safe boundary", literal: "9007199254740993" },
    { kind: "two below the negative safe boundary", literal: "-9007199254740993" },
    { kind: "the largest int64", literal: "9223372036854775807" },
    { kind: "the most negative int64", literal: "-9223372036854775808" },
  ];

  it.each(DECORATORS.flatMap((decorator) => EXACT.map((row) => ({ ...row, decorator }))))(
    "$decorator emits $kind unchanged",
    async ({ decorator, literal }) => {
      const { emitted, diagnostics } = await boundOf(decorator, literal);

      // Compared through BigInt, so an imprecise value is never asked whether
      // it equals another imprecise value.
      expect(BigInt(String(emitted))).toBe(BigInt(literal));
      expect(diagnosticsWith(diagnostics, "unrepresentable-numeric-constraint")).toHaveLength(0);
    },
  );

  it.each(DECORATORS.flatMap((decorator) => UNREPRESENTABLE.map((row) => ({ ...row, decorator }))))(
    "$decorator reports $kind and writes no bound",
    async ({ decorator, literal }) => {
      const { emitted, diagnostics } = await boundOf(decorator, literal);

      // Dropping is allowed, and the author has to be told. Rounding is not:
      // a bound that says a different number than the author wrote is worse
      // than no bound at all.
      expect(emitted).toBeUndefined();
      expect(
        diagnosticsWith(diagnostics, "unrepresentable-numeric-constraint").length,
      ).toBeGreaterThan(0);
    },
  );

  it("holds the boundary between the two answers at 2^53", async () => {
    // The pair that pins where the compiler's `asNumber` gives up. Stated as
    // one case so the two sides are read together: a change to that boundary
    // moves both halves of this assertion, and nothing else in the suite
    // would say where it had moved to.
    expect((await boundOf("minValue", "9007199254740991")).emitted).toBeDefined();
    expect((await boundOf("minValue", "9007199254740993")).emitted).toBeUndefined();
  });
});
