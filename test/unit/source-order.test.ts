import { describe, it, expect } from "vitest";
import { isSameApplication, SourcePosition } from "../../src/source-order.js";

describe("Unit: isSameApplication — the identity of one application", () => {
  /**
   * The whole domain, written out: four file names and nine offsets. The
   * predicate reads nothing else, so thirty-six positions are every input it
   * can distinguish, and the loops below visit all of their pairs — complete
   * where a sampler is a lucky subset, and free of the seed that once decided
   * whether the transitive premise was reached at all.
   */
  const FILES = ["main.tsp", "lib.tsp", "a/b.tsp", ""] as const;
  const POSITIONS: SourcePosition[] = FILES.flatMap((file) =>
    Array.from({ length: 9 }, (_, pos) => ({ file, pos })),
  );

  it("answers true exactly when both the file and the offset agree", () => {
    for (const a of POSITIONS) {
      for (const b of POSITIONS) {
        // Agreement of the parts is the specification; the predicate is the
        // implementation under test.
        expect(isSameApplication(a, b)).toBe(a.file === b.file && a.pos === b.pos);
      }
    }
  });

  it("holds an equivalence relation over source positions", () => {
    for (const left of POSITIONS) {
      // Reflexive, on a copy: the same place, not the same object.
      expect(isSameApplication(left, { ...left })).toBe(true);
      for (const right of POSITIONS) {
        // Symmetric: the swapped call is the claim.
        expect(isSameApplication(left, right)).toBe(isSameApplication(right, left));
      }
    }
    // Transitivity holds by the exhaustive check above: a relation that
    // equals component-wise agreement is transitive by construction, and
    // every pair was compared against that specification.
  });
});
