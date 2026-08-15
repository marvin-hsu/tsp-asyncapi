/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";
import { byCodePoint } from "../utils/sort.js";
import { createChainHarness, resolveSchema, winners, wireOf } from "./model-chain.js";

/**
 * Nothing a program declares may go missing from the emitted schema.
 *
 * A model's schema is assembled by three different paths. Which one runs
 * depends on the declaration. `applyExtends` normally emits
 * `{ allOf: [{ $ref: Base }, own] }`. It falls back to
 * `buildFlattenedObjectSchema` when a `never`-typed property overrides an
 * inherited one. It falls back again when an `@encodedName` override
 * resolves to a different wire name than its ancestor's. That fallback
 * rebuilds the whole property set by hand from `walkPropertiesInherited`.
 * Each path can lose a property in its own way. A lost property means a
 * producer omits a field every consumer needs.
 *
 * This property states the rule against the generator's own declaration
 * records. It does not consult the compiler's types. It builds a chain of 2
 * to 4 models. It then computes the wire names it declared: the
 * most-derived same-named property wins, `never` drops the name, and
 * `@encodedName` remaps it. It resolves the emitted component through
 * `allOf` branches and `$ref` links, then asserts the two sets are equal.
 * No extra key, no missing key.
 *
 * Both fallbacks are entered through warning-level diagnostics, so the
 * document is still produced. A test that only filters errors would never
 * notice them.
 *
 * The chain generator and renderer live in `./model-chain.js`. The
 * optionality property drives the same shape and shares them.
 */

/**
 * The name pool for this property, and the type each name carries.
 *
 * Two distinct names can never claim one wire name here. The pool is
 * `a`/`b`/`c`/`d`/`m0`/`m1`, `@encodedName` appends `w`, and no encoded form
 * is itself in the pool. So the declared wire-name set always has one owner
 * per name, and the equality below always states one answer.
 */
const NAME_TYPE: Record<string, string> = {
  a: "string",
  b: "int32",
  c: "boolean",
  d: "string",
};

const harness = createChainHarness({
  namePool: ["a", "b", "c", "d"],
  nameType: NAME_TYPE,
});

describe("Integration: Schemas — declared property coverage", () => {
  /**
   * Probe results, measured in this worktree at 200 runs with seed
   * 20260815. They say the property reaches what it targets. They also say
   * the resolution walk does real work, rather than restating a top-level
   * key list.
   *
   * `fc.pre` rejections do not count toward `numRuns`. The runner keeps
   * drawing until it has 200 executions that finished. So the two shape
   * counters add up to 200, and the refused programs are extra draws on top
   * of that.
   *
   *   documents emitted                            200
   *   extra draws the compiler refused              12
   *     (all with `override-property-mismatch`)
   *   components in the `allOf` shape              162
   *   components in the flattened shape             38
   *   `never-typed-property-override` warnings      44
   *   `encoded-name-override-conflict` warnings     15
   *   documents holding a component that carries
   *     `additionalProperties`                      98
   *   flattened documents describing at least one
   *     wire name the most-derived level does not
   *     declare                                     26
   *   documents where the component's own
   *     top-level `properties` alone is not the
   *     declared set                               157
   *
   * That last number is the one that matters. A check reading only
   * `schema.properties` would give the wrong answer for 157 of 200
   * documents. So the `allOf`/`$ref` walk is load-bearing here.
   *
   * Three counters are asserted below: the two shapes, and the one that
   * says the walk does real work. That keeps this record honest if the
   * generator or the emitter moves.
   */
  it("describes every declared property, through allOf and $ref", async () => {
    let allOfShape = 0;
    let flatShape = 0;
    let ownPropsNotDeclaredSet = 0;

    await fc.assert(
      fc.asyncProperty(harness.chainArb, async ({ levels, useIndexer }) => {
        const declared = harness.normalize(levels);
        const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(
          harness.render(declared, useIndexer),
        );

        // TypeSpec refuses some of these programs outright. The claim
        // starts once the emitter has answered with a document. Warnings
        // are kept: both fallback paths announce themselves with one.
        fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

        const schema = doc.components?.schemas?.["M" + String(declared.length - 1)];
        expect(schema).toBeDefined();

        if (Array.isArray(schema.allOf)) allOfShape++;
        else flatShape++;

        const found = [...resolveSchema(doc, schema).described].sort(byCodePoint);
        const expected = winners(declared).map(wireOf).sort(byCodePoint);

        // Records whether the `allOf`/`$ref` walk did real work here. The
        // component's own top-level `properties` is compared against the
        // declared set. A difference means a check reading only that key
        // would answer wrongly for this document.
        const ownProps = Object.keys((schema.properties ?? {}) as Record<string, unknown>).sort(
          byCodePoint,
        );
        if (JSON.stringify(ownProps) !== JSON.stringify(expected)) ownPropsNotDeclaredSet++;

        expect(found).toEqual(expected);
      }),
      { numRuns: 200, seed: 20260815 },
    );

    // A run that only ever took one assembly path would prove half of what
    // this property claims. A run where the top-level `properties` was
    // always the declared set would prove the resolution walk does no work.
    expect(allOfShape).toBeGreaterThan(0);
    expect(flatShape).toBeGreaterThan(0);
    expect(ownPropsNotDeclaredSet).toBeGreaterThan(0);
  }, 120000);
});
