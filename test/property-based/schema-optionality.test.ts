import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../utils/test-host.js";
import { byCodePoint } from "../utils/sort.js";
import { createChainHarness, resolveSchema, winners, wireOf, PropDecl } from "./model-chain.js";
import { schemasOf } from "../utils/document.js";

/**
 * Optionality survives, and `required` never names an undescribed key.
 *
 * `buildObjectSchemaFromProperties` decides `required` from `prop.optional`.
 * It is called twice over, from two different assembly paths.
 * `buildObjectSchema` hands it one model's own declared properties.
 * `buildFlattenedObjectSchema` hands it the whole `walkPropertiesInherited`
 * set. So the required set is rebuilt from scratch in the fallback path. A
 * mistake in either path rewrites the contract without a word. An optional
 * field turns mandatory, or a mandatory field turns optional.
 *
 * This property makes two main claims about the most-derived model's
 * schema, after resolving `allOf` branches and `$ref` links.
 *
 * 1. The union of every `required` array equals the set of wire names the
 *    generator declared without `?`. This is stated against the generator's
 *    own declaration records, never against the compiler's types.
 * 2. No single `required` array holds a duplicate entry.
 *
 * Claim 1 is asserted only when the declared set has no wire-name
 * collision. When two distinct TypeSpec names resolve to one wire name, one
 * of the two is dropped on purpose by the `claimedWireNames` guard. Which
 * one survives then decides the wire name's optionality, so the declared
 * set no longer names one answer. Claim 2 still applies to those documents.
 * It is the claim the guard exists to keep true.
 *
 * A third, weaker claim covers the documents claim 1 skips: every
 * `required` entry is also described under `properties` somewhere in the
 * same resolution. A schema that demands a key it never describes tells a
 * producer nothing about what to send. Read it as a guard for the
 * wire-collision documents, not as a third equal claim. On a document with
 * no collision it follows from the other two properties: claim 1 already
 * pins the required union to the declared non-optional set, and the
 * coverage property beside this one pins the described set to the declared
 * set. Only a slice of the drawn documents reaches the collision guard, so
 * this claim is what covers that slice. A counter below asserts the slice is
 * never empty.
 *
 * The chain generator and renderer live in `./model-chain.js`. The coverage
 * property drives the same shape and shares them.
 */

/**
 * The name pool for this property, and the type each name carries.
 *
 * `a` and `aw` are the collision pair. `a` always carries
 * `@encodedName("application/json", "aw")`, and `aw` never carries one. So
 * a chain that declares both, on two different levels, hands one wire name
 * to two distinct TypeSpec properties. That is the only way to reach the
 * `claimedWireNames` guard. Declaring both on one level does not work: the
 * compiler rejects it with its own `encoded-name-conflict` error, so no
 * document is emitted at all. `guardWireNames` drops that shape for the same
 * reason.
 *
 * `a` and `aw` are drawn twice as often as the rest. Both must appear in one
 * chain for the collision guard to run, so the pair needs the extra weight.
 * Leaving both flags free instead of forcing them made the guard run an
 * order of magnitude less often.
 */
const NAME_TYPE: Record<string, string> = {
  a: "string",
  aw: "string",
  b: "int32",
  c: "boolean",
  d: "string",
};

const harness = createChainHarness({
  namePool: ["a", "a", "aw", "aw", "b", "c", "d"],
  nameType: NAME_TYPE,
  encodedOverride: { a: true, aw: false },
  guardWireNames: true,
});

/** True when two distinct TypeSpec names claim one wire name. */
function hasWireCollision(props: readonly PropDecl[]): boolean {
  return new Set(props.map(wireOf)).size !== props.length;
}

/** The wire names the generator declared without `?`. */
function expectedRequired(props: readonly PropDecl[]): string[] {
  return props
    .filter((prop) => !prop.optional)
    .map(wireOf)
    .sort(byCodePoint);
}

describe("Integration: Schemas — optionality and required", () => {
  /**
   * What this property is instrumented for, and what the probes established.
   *
   * `fc.pre` rejections do not count toward `numRuns`. The runner keeps
   * drawing until it has that many executions that finished, so the shape
   * counters below partition the finished runs and the refused programs are
   * extra draws on top of them.
   *
   * The counters cover the two component shapes (`allOf` and flattened),
   * resolutions holding more than one `required` array, documents where the
   * component's own top-level `required` is not the whole union, flattened
   * documents whose `required` holds a wire name the most-derived level does
   * not declare, and documents reaching the `claimedWireNames` guard. They
   * are asserted, not recorded here, because a number in a comment goes stale
   * and a number in an `expect` does not.
   *
   * The union form is the one that matters. A check reading only the
   * component's own `required` gives the wrong answer on most drawn
   * documents, which is why the counter for it is asserted. Probes also
   * showed `required` really does split
   * across `allOf` branches. For `model A { a1: string; @encodedName(...,
   * "a2w") a2: string; }` and `model C extends A { c1: string; c2?: string;
   * }`, `A` requires `["a1","a2w"]` and `C`'s own branch requires only
   * `["c1"]`.
   *
   * The guard was probed on its own, because the generator reaches it on
   * only a small slice of documents. For
   * `model D0 { aw: int32; x: string; }` and `model D1 extends D0
   * { @encodedName("application/json", "aw") a: string; x: never; }` the
   * emitter reports `tsp-asyncapi/encoded-name-override-conflict` at
   * warning severity, flattens, and produces
   * `{"type":"object","properties":{"aw":{"type":"string"}},
   * "required":["aw"]}`. The guard is what makes that observable. Without
   * it, `D0`'s `aw` would overwrite the entry with `{"type":"integer"...}`
   * and push a second `"aw"` onto `required`.
   *
   * One shape this generator can never produce: an override that relaxes an
   * inherited required property to optional. TypeSpec rejects it with
   * `override-property-mismatch`, so no document is emitted. Probed with
   * `model E0 { e: string; }` and `model E1 extends E0 { e?: string; }`.
   *
   * Two mutations of `buildObjectSchemaFromProperties` confirmed the claims
   * bite, and were reverted. Removing the `claimedWireNames` guard failed
   * claim 2. Pushing every wire name onto `required`, ignoring
   * `prop.optional`, failed claim 1 with `['m0','m1']` against `['m0']`.
   *
   * Note that the test host compiles against the built `dist/`, not `src/`.
   * Run `pnpm build` before judging a source change by this property.
   *
   * Every claim above that depends on the generator reaching a shape has a
   * counter asserted below. That keeps this record honest when the generator
   * or the emitter moves.
   */
  it("keeps declared optionality and requires only described keys", async () => {
    let allOfShape = 0;
    let flatShape = 0;
    let splitRequired = 0;
    let guardReached = 0;
    let ownRequiredNotUnion = 0;

    await fc.assert(
      fc.asyncProperty(harness.chainArb, async ({ levels, useIndexer }) => {
        const declared = harness.normalize(levels);
        const { doc, diagnostics } = await emitDocumentWithDiagnostics(
          harness.render(declared, useIndexer),
        );

        // TypeSpec refuses some of these programs outright. The claim starts
        // once the emitter has answered with a document. Warnings are kept:
        // both fallback paths announce themselves with one.
        fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

        const schema = schemasOf(doc)["M" + String(declared.length - 1)];
        expect(schema).toBeDefined();
        const flat = !Array.isArray(schema.allOf);
        if (flat) flatShape++;
        else allOfShape++;

        const out = resolveSchema(doc, schema);
        if (out.requiredArrays.length > 1) splitRequired++;

        // Claim 2. Each array on its own, so a name legitimately required by
        // two `allOf` branches is not read as a duplicate.
        for (const arr of out.requiredArrays) {
          expect(new Set(arr).size).toBe(arr.length);
        }

        // The weaker coverage guard. A demanded key must be described
        // somewhere in the same resolution. It carries new information only
        // on the wire-collision documents, where claim 1 below is skipped.
        const union = [...new Set(out.requiredArrays.flat())].sort(byCodePoint);
        for (const name of union) {
          expect(out.described.has(name)).toBe(true);
        }

        // Records whether the `allOf`/`$ref` walk did real work here. The
        // component's own top-level `required` is compared against the
        // union the walk collected. A difference means a check reading only
        // the top-level array would answer wrongly for this document.
        const ownRequired = [...new Set(schema.required ?? [])].sort(byCodePoint);
        if (JSON.stringify(ownRequired) !== JSON.stringify(union)) ownRequiredNotUnion++;

        // Claim 1. Only for a declared set with one owner per wire name.
        const declaredProps = winners(declared);
        if (hasWireCollision(declaredProps)) {
          if (flat) guardReached++;
          return;
        }
        expect(union).toEqual(expectedRequired(declaredProps));
      }),
      { numRuns: 200, seed: 20260815 },
    );

    // A run that only ever took one assembly path, never split `required`,
    // or never reached the collision guard would prove less than this
    // property claims. A run where the top-level `required` was always the
    // whole union would prove the resolution walk does no work.
    expect(allOfShape).toBeGreaterThan(0);
    expect(flatShape).toBeGreaterThan(0);
    expect(splitRequired).toBeGreaterThan(0);
    expect(guardReached).toBeGreaterThan(0);
    expect(ownRequiredNotUnion).toBeGreaterThan(0);
  });
});
