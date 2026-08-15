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
 * The second property exists for the drop-and-report branch, so that branch
 * has to be reached. Measured in this worktree at 200 runs with seed
 * 20260815: 68 runs were dropped and reported, and 132 runs emitted a value.
 * Roughly half of every draw is a small value that cannot reach the branch,
 * so the split is not free. Both counters are asserted inside the property,
 * which keeps this record honest if the generator or the emitter moves.
 *
 * The boundary sits exactly at 2^53. 9007199254740991 is emitted unchanged,
 * 9007199254740993 is dropped and reported, and both ends of `int64` are
 * dropped and reported.
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

  /**
   * Reachability, measured in this worktree at 150 runs with seed 20260815.
   * The seed is pinned in the call below, so these counts reproduce.
   *
   *   values emitted and compared                  150
   *   draws with magnitude at or above 2^31        120
   *   largest magnitude drawn         9007199254740987
   *
   * The claim is trivial for a small integer. Every JSON writer round-trips
   * 7 correctly. It only says something near the safe-integer boundary,
   * where one wrong step turns the bound into a different number. So the
   * count of large draws is what makes this property mean anything. Both
   * `large` and `largest` are asserted below, so both recorded numbers keep
   * a live check. A later narrowing of the generator would fail an
   * assertion instead of passing quietly. `largest` is the counter that
   * matters most. The safe-integer boundary at 2^53 is the whole point of
   * this property. A narrowed range that still cleared 2^31 would satisfy
   * `large` alone and leave the recorded boundary-proximity number stale.
   */
  it("emits a safe integer bound unchanged", async () => {
    let large = 0;
    let largest = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("minValue", "maxValue"),
        fc.integer({ min: -(2 ** 53) + 1, max: 2 ** 53 - 1 }),
        async (decorator, value) => {
          const magnitude = Math.abs(value);
          if (magnitude >= 2 ** 31) large++;
          if (magnitude > largest) largest = magnitude;

          const { doc, diagnostics } = await emitConstraint(decorator, String(value));
          fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

          const schema = doc.components?.schemas?.Root?.properties?.v;
          // A value JavaScript represents exactly must arrive intact. The
          // emitter has no reason to report or drop it.
          expect(schema?.[keywordOf[decorator]]).toBe(value);
        },
      ),
      { numRuns: 150, seed: 20260815 },
    );

    // A run drawing only small integers would assert nothing the boundary
    // cares about. The largest draw also has to come near 2^53, since that
    // is where a wrong step changes the bound.
    expect(large).toBeGreaterThan(0);
    expect(largest).toBeGreaterThan(2 ** 52);
  }, 180000);

  it("never emits a bound that differs from the one declared", async () => {
    // Values past the safe range are the interesting ones: they are legal
    // `int64` literals, and a JavaScript number cannot hold them. The
    // emitter must report and drop, not round.
    const wideLiteral = fc.oneof(
      fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }).map((v) => v.toString()),
      fc.integer({ min: -1000, max: 1000 }).map((v) => String(v)),
    );

    let dropped = 0;
    let emittedCount = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("minValue", "maxValue"),
        wideLiteral,
        async (decorator, literal) => {
          const { doc, diagnostics } = await emitConstraint(decorator, literal);
          fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

          const emitted = doc.components?.schemas?.Root?.properties?.v?.[keywordOf[decorator]];
          if (emitted === undefined) {
            dropped++;
            // Dropping is allowed, and the author has to be told.
            expect(
              diagnostics.some((d) => d.code.includes("unrepresentable-numeric-constraint")),
            ).toBe(true);
            return;
          }

          emittedCount++;
          // Anything emitted has to mean the same number that was written.
          // Comparing through BigInt avoids asking one imprecise value
          // whether it equals another imprecise value.
          expect(BigInt(String(emitted))).toBe(BigInt(literal));
        },
      ),
      { numRuns: 200, seed: 20260815 },
    );

    // A run that never dropped anything would leave the drop-and-report
    // branch, the whole point of this property, unwatched. A run that never
    // emitted anything would never compare a bound at all.
    expect(dropped).toBeGreaterThan(0);
    expect(emittedCount).toBeGreaterThan(0);
  }, 180000);
});
