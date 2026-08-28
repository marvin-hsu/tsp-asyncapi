import { describe, it, expect } from "vitest";
import { hasError } from "../../utils/diagnostics.js";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { byCodePoint } from "../../utils/sort.js";
import { createChainHarness, resolveSchema, winners, wireOf, PropDecl } from "../model-chain.js";
import { schemaOf, schemasOf } from "../../utils/document.js";

/**
 * Optionality survives, and `required` never names an undescribed key.
 *
 * `buildObjectSchemaFromProperties` decides `required` from `prop.optional`.
 * Two assembly paths call it: `buildObjectSchema` hands it one model's own
 * declared properties, and the `buildFlattenedObjectSchema` fallback hands
 * it the whole `walkPropertiesInherited` set. A mistake in either path
 * rewrites the contract silently, turning an optional field mandatory or a
 * mandatory field optional.
 *
 * This property checks two claims about the most-derived model's schema,
 * after resolving `allOf` branches and `$ref` links, against the
 * generator's own declaration records rather than the compiler's types.
 *
 * 1. The union of every `required` array equals the wire names declared
 *    without `?`.
 * 2. No single `required` array holds a duplicate entry.
 *
 * Claim 1 only holds when the declared set has no wire-name collision. When
 * two distinct TypeSpec names resolve to one wire name, the
 * `claimedWireNames` guard drops one on purpose, so the declared set no
 * longer names a single answer. Claim 2 still holds for those documents;
 * it is the claim the guard exists to keep true.
 *
 * A third, weaker claim covers what claim 1 skips: every `required` entry
 * is also described under `properties` in the same resolution. A schema
 * that demands an undescribed key tells a producer nothing to send. This
 * claim only carries new information on the wire-collision documents.
 *
 * The chain generator and renderer live in `./model-chain.js`, shared with
 * the coverage property beside this one.
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
   * `fc.pre` rejections do not count toward `numRuns`, so the shape counters
   * below partition only the finished runs.
   *
   * The counters cover both component shapes (`allOf` and flattened),
   * resolutions with more than one `required` array, documents where the
   * component's own top-level `required` is not the whole union, and
   * documents that reach the `claimedWireNames` guard. Checking only the
   * top-level `required` gives the wrong answer on most drawn documents,
   * which is why that counter is asserted rather than assumed.
   *
   * This generator can never produce an override that relaxes an inherited
   * required property to optional: TypeSpec rejects that with
   * `override-property-mismatch`, so no document is emitted.
   *
   * The test host compiles against the built `dist/`, not `src/`. Run
   * `pnpm build` before judging a source change by this property.
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
        fc.pre(doc !== null && !hasError(diagnostics));

        const schema = schemaOf(schemasOf(doc)["M" + String(declared.length - 1)]);
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
