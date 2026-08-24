import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { schemaOf, schemasOf } from "../../utils/document.js";
import { byCodePoint } from "../../utils/sort.js";
import { createChainHarness, resolveSchema, winners, wireOf } from "../model-chain.js";

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
   * What this property is instrumented for. The counters say it reaches what
   * it targets, and that the resolution walk does real work rather than
   * restating a top-level key list.
   *
   * `fc.pre` rejections do not count toward `numRuns`. The runner keeps
   * drawing until it has that many executions that finished, so the two
   * shape counters partition the finished runs and the refused programs are
   * extra draws on top of them. The refusals the generator provokes are all
   * `override-property-mismatch`.
   *
   * Three counters are asserted below: the `allOf` shape, the flattened
   * shape, and the one that carries the weight here — a document where the
   * component's own top-level `properties` alone is not the declared set. A
   * check reading only `schema.properties` gives the wrong answer on most
   * drawn documents, so the `allOf`/`$ref` walk is load-bearing.
   *
   * Asserting them rather than recording them is the point: a number in a
   * comment goes stale, and a number in an `expect` fails.
   */
  it("describes every declared property, through allOf and $ref", async () => {
    let allOfShape = 0;
    let flatShape = 0;
    let ownPropsNotDeclaredSet = 0;

    await fc.assert(
      fc.asyncProperty(harness.chainArb, async ({ levels, useIndexer }) => {
        const declared = harness.normalize(levels);
        const { doc, diagnostics } = await emitDocumentWithDiagnostics(
          harness.render(declared, useIndexer),
        );

        // TypeSpec refuses some of these programs outright. The claim
        // starts once the emitter has answered with a document. Warnings
        // are kept: both fallback paths announce themselves with one.
        // `fc.pre` throws to drop the draw, but TypeScript cannot see that
        // through a call. Returning through it narrows `doc` for the rest of
        // the body and drops the draw exactly as before.
        if (doc === null || diagnostics.some((d) => d.severity === "error")) {
          fc.pre(false);
          return;
        }

        const schema = schemaOf(schemasOf(doc)["M" + String(declared.length - 1)]);
        expect(schema).toBeDefined();

        if (Array.isArray(schema.allOf)) allOfShape++;
        else flatShape++;

        const found = [...resolveSchema(doc, schema).described].sort(byCodePoint);
        const expected = winners(declared).map(wireOf).sort(byCodePoint);

        // Records whether the `allOf`/`$ref` walk did real work here. The
        // component's own top-level `properties` is compared against the
        // declared set. A difference means a check reading only that key
        // would answer wrongly for this document.
        const ownProps = Object.keys(schema.properties ?? {}).sort(byCodePoint);
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
  });
});
