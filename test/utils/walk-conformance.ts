import { describe, expect, it } from "vitest";

/**
 * What every schema walk in this repository must hold, whatever it emits.
 *
 * Two walks turn TypeSpec types into a schema of another language: the
 * Protobuf one inside this emitter, and the Avro one inside `tsp-avro`. They
 * emit different shapes and share no code, because the shapes disagree where
 * it matters. Protobuf lays its declarations out flat and refers to them by
 * name; Avro nests a declaration at its first occurrence and refers to it by
 * name after that. There is no useful common implementation.
 *
 * There is a common contract. Both walk a graph that can loop, both name what
 * they walk, and both must refuse rather than write something wrong. That
 * contract is what this file holds.
 *
 * ## Why a shared suite rather than a shared interface
 *
 * An interface earns its place when something consumes it without knowing
 * which implementation it holds. Nothing does that here. Worse, an interface
 * cannot state the rule that actually broke: keying a closure by the rendered
 * name rather than by the type. A `Map<K, V>` satisfies any interface for
 * either choice of `K`.
 *
 * A suite states the rule as an outcome instead, and the outcome is testable.
 * The Protobuf walk had a closure keyed by rendered name and two declarations
 * collapsed into one; the Avro walk carried the diagnostic for that case and
 * nothing ever reached it. Each walk knew something the other did not.
 *
 * ## Why the sources are supplied per walk
 *
 * The invariants are shared; the sources cannot be. Protobuf needs a package
 * and a field number on every property, Avro needs a namespace and neither.
 * So each walk brings its own source for each invariant, and the type below
 * makes that a complete set: leaving one out is a compile error rather than a
 * gap nobody notices.
 */

/** How one walk answers for one source. */
export type WalkOutcome =
  | { readonly kind: "built" }
  | { readonly kind: "refused"; readonly diagnostics: readonly string[] };

/** One case: a source, and the model the walk starts from. */
export interface ConformanceCase {
  /** The TypeSpec source, written the way this walk's decorators require. */
  readonly source: string;
  /** The declaration the walk is asked to build. */
  readonly root: string;
}

/**
 * A source for every invariant.
 *
 * The keys are required, so a walk that joins this suite has to answer every
 * one of them. That is the point: the gap this file exists for was an
 * invariant one walk tested and the other did not.
 */
interface ConformanceSources {
  /** A declaration that reaches itself through a field. */
  readonly selfRecursion: ConformanceCase;
  /** Two declarations that reach each other. */
  readonly mutualRecursion: ConformanceCase;
  /** Two distinct declarations that render to one name. */
  readonly nameCollision: ConformanceCase;
  /** A model and an enum that render to one name. */
  readonly crossKindCollision: ConformanceCase;
}

/** A walk under test, and how to run one source through it. */
export interface WalkUnderTest {
  /** The name this walk goes by in the test output. */
  readonly name: string;
  /** Runs one case and says what the walk did. */
  run(one: ConformanceCase): Promise<WalkOutcome>;
  /** Every source this walk brings. */
  readonly sources: ConformanceSources;
}

/**
 * Runs the shared contract against one walk.
 *
 * @param walk - The walk under test and its sources
 */
export function describeWalkConformance(walk: WalkUnderTest): void {
  describe(`Conformance: the ${walk.name} walk`, () => {
    /**
     * A loop must end. A walk that records a declaration only after its
     * fields are done never finds the one it is inside, and recurses until
     * the stack gives out.
     */
    it("ends on a declaration that reaches itself", async () => {
      const outcome = await walk.run(walk.sources.selfRecursion);
      expect(outcome.kind).toBe("built");
    });

    /** The same rule, entered from outside the loop rather than inside it. */
    it("ends on two declarations that reach each other", async () => {
      const outcome = await walk.run(walk.sources.mutualRecursion);
      expect(outcome.kind).toBe("built");
    });

    /**
     * Two declarations, one name. Neither target language can hold both, and
     * writing one of them twice would describe two types as one. A walk that
     * keys its closure by the rendered name does not notice: the second
     * declaration reads as the first, and the output is wrong without a word.
     */
    it("refuses two declarations that render to one name", async () => {
      const outcome = await walk.run(walk.sources.nameCollision);
      expect(outcome.kind).toBe("refused");
      // A refusal with nothing to read is a refusal the author cannot act on.
      if (outcome.kind === "refused") {
        expect(outcome.diagnostics.length).toBeGreaterThan(0);
      }
    });

    /**
     * The same collision across kinds. A walk that keeps one registry per
     * kind passes the case above and fails this one, so both are asked.
     */
    it("refuses a model and an enum that render to one name", async () => {
      const outcome = await walk.run(walk.sources.crossKindCollision);
      expect(outcome.kind).toBe("refused");
      if (outcome.kind === "refused") {
        expect(outcome.diagnostics.length).toBeGreaterThan(0);
      }
    });
  });
}
