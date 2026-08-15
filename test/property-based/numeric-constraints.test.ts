/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";

/**
 * A numeric constraint is emitted exactly, or it is not emitted at all.
 *
 * TypeSpec holds a numeric literal at arbitrary precision. JSON, and the
 * JavaScript number the emitter builds the document with, do not. A value
 * that cannot survive the trip has to be reported and dropped, because a
 * constraint that is emitted slightly wrong rejects payloads the author
 * meant to accept, and nothing in the document says it was rewritten.
 *
 * The emitter has `unrepresentable-numeric-constraint` for this. These
 * properties hold it to the rule across the range rather than at the few
 * boundaries an example test can name.
 *
 * The drop-and-report branch was checked to be reachable. The boundary sits
 * exactly at 2^53: 9007199254740991 is emitted unchanged, 9007199254740993
 * is dropped and reported, and both ends of `int64` are dropped and
 * reported. So the second property is not passing for want of reaching the
 * interesting values.
 */
describe("Property: numeric constraints", () => {
  /** Compiles one scalar property carrying one constraint. */
  async function emitConstraint(decorator: string, literal: string) {
    return emitAsyncAPIWithDiagnostics(`
      @AsyncAPI.message
      model Root {
        @${decorator}(${literal})
        v: int64;
      }
    `);
  }

  const keywordOf: Record<string, string> = {
    minValue: "minimum",
    maxValue: "maximum",
  };

  it("emits a safe integer bound unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("minValue", "maxValue"),
        fc.integer({ min: -(2 ** 53) + 1, max: 2 ** 53 - 1 }),
        async (decorator, value) => {
          const { doc, diagnostics } = await emitConstraint(decorator, String(value));
          fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

          const schema = doc.components?.schemas?.Root?.properties?.v;
          // A value JavaScript represents exactly must arrive intact. The
          // emitter has no reason to report or drop it.
          expect(schema?.[keywordOf[decorator]]).toBe(value);
        },
      ),
      { numRuns: 150 },
    );
  }, 180000);

  it("never emits a bound that differs from the one declared", async () => {
    // Values past the safe range are the interesting ones: they are legal
    // `int64` literals, and a JavaScript number cannot hold them. The
    // emitter must report and drop, not round.
    const wideLiteral = fc.oneof(
      fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }).map((v) => v.toString()),
      fc.integer({ min: -1000, max: 1000 }).map((v) => String(v)),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("minValue", "maxValue"),
        wideLiteral,
        async (decorator, literal) => {
          const { doc, diagnostics } = await emitConstraint(decorator, literal);
          fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

          const emitted = doc.components?.schemas?.Root?.properties?.v?.[keywordOf[decorator]];
          if (emitted === undefined) {
            // Dropping is allowed, and the author has to be told.
            expect(
              diagnostics.some((d) => d.code.includes("unrepresentable-numeric-constraint")),
            ).toBe(true);
            return;
          }

          // Anything emitted has to mean the same number that was written.
          // Comparing through BigInt avoids asking one imprecise value
          // whether it equals another imprecise value.
          expect(BigInt(String(emitted))).toBe(BigInt(literal));
        },
      ),
      { numRuns: 200, seed: 20260815 },
    );
  }, 180000);
});
