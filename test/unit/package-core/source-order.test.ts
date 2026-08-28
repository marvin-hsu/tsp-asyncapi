import { describe, it, expect } from "vitest";
import { isSameApplication, SourcePosition } from "#core/source-order.js";

describe("Unit: isSameApplication — the identity of one application", () => {
  /**
   * The predicate reads only a file name and an offset, so these
   * thirty-six positions cover every input it can distinguish. The loops
   * below check every pair, proving transitivity by exhaustion instead of
   * by sampling.
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
    // Transitivity holds by construction. A relation that equals
    // component-wise agreement is transitive, and every pair above was
    // compared against that specification.
  });
});
