import { describe, it, expect } from "vitest";
import { expectNoErrors } from "../../utils/diagnostics.js";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { schemaOf, schemasOf } from "../../utils/document.js";
import type { AsyncAPIDocument } from "#emitter/types/index.js";

/** Where a schema reference points inside one document. */
const SCHEMA_REF_PREFIX = "#/components/schemas/";

/**
 * No declared constraint is erased by a more-derived level.
 *
 * A validation constraint can be declared at several levels of one value.
 * A base scalar declares one. A derived scalar declares another. The
 * property use site declares a third. Two constraints on the same value are
 * a JSON Schema intersection. Both must hold.
 *
 * Plain object spread would instead let the more-derived level replace the
 * ancestor's value. The emitted schema would then accept payloads the
 * author's own declaration rejects. Nothing reports that. There is no
 * diagnostic for an erased constraint. The only defence is the `allOf` wrap
 * in `withDocs` and `withPropertyDocs`, whose collision set is computed by
 * hand.
 *
 * So this property is stated over the resolved schema, not over the wrap
 * rule. It reads every `(keyword, value)` pair the source declares. It then
 * requires each pair to appear somewhere in the emitted schema for that
 * property, counting nested `allOf` branches. It does not say where.
 *
 * `format` is excluded. Two `format`s on one value are a contradiction, not
 * an intersection, so last-wins is the documented intent there.
 *
 * Reachability, measured with a probe before this test was written:
 *   - `@minLength(2) scalar S1 extends string;`
 *     `@minLength(5) scalar S2 extends S1;` and `@minLength(4)` on the
 *     property emits
 *     `{allOf:[{allOf:[{type:string,minLength:2}],minLength:5}],minLength:4}`.
 *     One program enters both collision branches, `withDocs` and
 *     `withPropertyDocs`, and keeps all three values.
 *   - A chain with no repeated keyword instead merges flat:
 *     `@minLength(2) scalar T1 extends string; @maxLength(9) scalar T2
 *     extends T1;` with `@pattern("^a")` on the property emits
 *     `{type:string,minLength:2,maxLength:9,pattern:"^a"}`, no `allOf`.
 *     So the collision branch is not entered by every input, and the run
 *     counters below check the generator still reaches it.
 *   - Decorator kind and scalar kind have to agree. `@minItems(2) scalar W1
 *     extends string;` is rejected with `decorator-wrong-target`. Two
 *     bounds inverted on one target, `@minLength(9) @maxLength(2)`, is
 *     rejected with `invalid-range`. A numeric bound outside an ancestor
 *     scalar's own range is rejected with `unassignable`: `@minValue(4)` on
 *     a property whose scalar declares `@minValue(5)` gives "Type '4' is
 *     not assignable to type 'Test.N2'". The generators below avoid all
 *     three, so no input is silently thrown away.
 *   - Each property counts how many runs produced an `allOf` at all, and how
 *     many produced an `allOf` nested inside another `allOf`. Both are
 *     asserted non-zero. The collision branch runs on nearly every input,
 *     and the two-level nesting that stacks `withDocs`'s wrap under
 *     `withPropertyDocs`'s wrap runs on most of
 *     them.
 */
describe("Property: no declared constraint is erased", () => {
  const KEYWORDS = ["minLength", "maxLength", "pattern", "minimum", "maximum"] as const;

  /** One `(keyword, value)` pair, in a form two levels can be compared by. */
  function pairKey(keyword: string, value: string | number): string {
    return `${keyword}=${JSON.stringify(value)}`;
  }

  /**
   * Collects every constraint pair the emitted schema states, at any depth
   * of `allOf`. Also returns how deeply `allOf` was nested, which is how
   * the test checks it reached the collision branch.
   */
  function collectEmitted(schema: unknown): { pairs: Set<string>; allOfDepth: number } {
    const pairs = new Set<string>();
    let allOfDepth = 0;

    const walk = (node: unknown, depth: number): void => {
      if (node === null || typeof node !== "object") return;
      const record = node as Record<string, unknown>;
      for (const keyword of KEYWORDS) {
        const value = record[keyword];
        if (typeof value === "string" || typeof value === "number") {
          pairs.add(pairKey(keyword, value));
        }
      }
      const branches = record.allOf;
      if (Array.isArray(branches)) {
        allOfDepth = Math.max(allOfDepth, depth + 1);
        for (const branch of branches) {
          walk(branch, depth + 1);
        }
      }
    };

    walk(schema, 0);
    return { pairs, allOfDepth };
  }

  /** One level's declarations: the source text, and the pairs it promises. */
  interface Level {
    decorators: string[];
    declared: string[];
  }

  /**
   * Compiles a chain of user scalars plus a property use site, then returns
   * the emitted schema for that property.
   */
  async function emitChain(base: string, levels: Level[]): Promise<unknown> {
    const scalarLevels = levels.slice(0, -1);
    const useSite = levels[levels.length - 1];
    const declarations = scalarLevels
      .map((level, i) => {
        const parent = i === 0 ? base : `S${String(i - 1)}`;
        return `${level.decorators.join(" ")} scalar S${String(i)} extends ${parent};`;
      })
      .join("\n");
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${declarations}
      @AsyncAPI.message
      model Root {
        ${useSite.decorators.join(" ")}
        v: S${String(scalarLevels.length - 1)};
      }
    `);
    // An error here means the generator built illegal TypeSpec. Fail loudly
    // instead of skipping, so the property cannot starve unnoticed.
    expectNoErrors(diagnostics);
    // A user-declared scalar earns a `components.schemas` entry, so the
    // property may write a reference to it. The claim is about what the
    // document says, not where it says it, so the reference is followed.
    return followRefs(doc, schemaOf(schemasOf(doc).Root).properties?.v);
  }

  /**
   * Replaces every `#/components/schemas/` reference with what it names.
   *
   * `open` holds the components already being expanded on this path. A model
   * that names itself is legal and writes a reference to its own component,
   * so expanding it again would never end. Meeting an open component leaves
   * the reference as it stands: the constraints of that component are
   * already being collected further up the path, so nothing is lost.
   */
  function followRefs(
    doc: AsyncAPIDocument | null,
    schema: unknown,
    open: ReadonlySet<string> = new Set(),
  ): unknown {
    if (Array.isArray(schema)) return schema.map((item) => followRefs(doc, item, open));
    if (schema === null || typeof schema !== "object") return schema;
    const ref = (schema as { $ref?: unknown }).$ref;
    if (typeof ref === "string" && ref.startsWith(SCHEMA_REF_PREFIX)) {
      const key = ref.slice(SCHEMA_REF_PREFIX.length);
      if (open.has(key)) return schema;
      return followRefs(doc, schemasOf(doc)[key], new Set(open).add(key));
    }
    return Object.fromEntries(
      Object.entries(schema as Record<string, unknown>).map(([name, value]) => [
        name,
        followRefs(doc, value, open),
      ]),
    );
  }

  /** Asserts every declared pair survives into the emitted schema. */
  function expectNoErasure(levels: Level[], schema: unknown): number {
    const { pairs, allOfDepth } = collectEmitted(schema);
    const declared = new Set(levels.flatMap((level) => level.declared));
    for (const pair of declared) {
      expect(pairs.has(pair), `${pair} is missing from ${JSON.stringify(schema)}`).toBe(true);
    }
    return allOfDepth;
  }

  it("keeps every string constraint declared along a scalar chain", async () => {
    // `minLength` never exceeds `maxLength` on one target, so `invalid-range`
    // cannot fire. Across levels the two are unrelated, and the compiler
    // accepts that (probed).
    const stringLevel = fc
      .record({
        min: fc.option(fc.integer({ min: 0, max: 6 }), { nil: undefined }),
        extra: fc.integer({ min: 0, max: 6 }),
        hasMax: fc.boolean(),
        // A small pool makes a repeated keyword, and so a collision, common.
        pattern: fc.option(fc.constantFrom("^a", "^b+$", "[0-9]{2}"), { nil: undefined }),
      })
      .map(({ min, extra, hasMax, pattern }): Level => {
        const decorators: string[] = [];
        const declared: string[] = [];
        if (min !== undefined) {
          decorators.push(`@minLength(${String(min)})`);
          declared.push(pairKey("minLength", min));
        }
        if (hasMax) {
          const max = (min ?? 0) + extra;
          decorators.push(`@maxLength(${String(max)})`);
          declared.push(pairKey("maxLength", max));
        }
        if (pattern !== undefined) {
          decorators.push(`@pattern("${pattern}")`);
          declared.push(pairKey("pattern", pattern));
        }
        return { decorators, declared };
      });

    let withAllOf = 0;
    let withNestedAllOf = 0;

    await fc.assert(
      fc.asyncProperty(
        // 2 or 3 user scalars, plus the property use site.
        fc
          .integer({ min: 3, max: 4 })
          .chain((n) => fc.array(stringLevel, { minLength: n, maxLength: n })),
        async (levels) => {
          const schema = await emitChain("string", levels);
          const depth = expectNoErasure(levels, schema);
          if (depth >= 1) withAllOf++;
          if (depth >= 2) withNestedAllOf++;
        },
      ),
      { numRuns: 150, seed: 20260815 },
    );

    // A property that never reaches the collision branch proves nothing.
    expect(withAllOf).toBeGreaterThan(0);
    expect(withNestedAllOf).toBeGreaterThan(0);
  });

  it("keeps every numeric bound declared along a scalar chain", async () => {
    // Each level's bounds sit inside its ancestor's, because the compiler
    // rejects a bound that is not assignable to the scalar being derived
    // from (probed: `unassignable`). The bounds narrow by 0 to 5 per level,
    // so a repeated value, and so a collision, is common.
    const numericChain = (count: number) =>
      fc
        .record({
          lowSteps: fc.array(fc.integer({ min: 0, max: 5 }), {
            minLength: count,
            maxLength: count,
          }),
          highSteps: fc.array(fc.integer({ min: 0, max: 5 }), {
            minLength: count,
            maxLength: count,
          }),
          hasMin: fc.array(fc.boolean(), { minLength: count, maxLength: count }),
          hasMax: fc.array(fc.boolean(), { minLength: count, maxLength: count }),
        })
        .map(({ lowSteps, highSteps, hasMin, hasMax }): Level[] => {
          let low = -1000;
          let high = 1000;
          return lowSteps.map((lowStep, i) => {
            low += lowStep;
            high -= highSteps[i];
            const decorators: string[] = [];
            const declared: string[] = [];
            if (hasMin[i]) {
              decorators.push(`@minValue(${String(low)})`);
              declared.push(pairKey("minimum", low));
            }
            if (hasMax[i]) {
              decorators.push(`@maxValue(${String(high)})`);
              declared.push(pairKey("maximum", high));
            }
            return { decorators, declared };
          });
        });

    let withAllOf = 0;
    let withNestedAllOf = 0;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 3, max: 4 }).chain((n) => numericChain(n)),
        async (levels) => {
          const schema = await emitChain("int32", levels);
          const depth = expectNoErasure(levels, schema);
          if (depth >= 1) withAllOf++;
          if (depth >= 2) withNestedAllOf++;
        },
      ),
      { numRuns: 150, seed: 20260815 },
    );

    expect(withAllOf).toBeGreaterThan(0);
    expect(withNestedAllOf).toBeGreaterThan(0);
  });

  /**
   * The resolver above is the one piece of this suite that could fail to
   * terminate rather than fail an assertion. The chains the generator builds
   * hold no recursion, so nothing else here walks a component that names
   * itself. This case does, and it is what keeps the guard honest.
   */
  it("stops expanding a component that names itself", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      model Node {
        value: string;
        next?: Node;
      }
      @AsyncAPI.message
      model Root {
        v: Node;
      }
    `);

    expectNoErrors(diagnostics);
    const resolved = followRefs(doc, schemaOf(schemasOf(doc).Root).properties?.v);

    // One level is expanded, and the reference back to `Node` is left as it
    // stands rather than expanded a second time.
    expect(resolved).toMatchObject({
      type: "object",
      properties: { next: { $ref: "#/components/schemas/Node" } },
    });
  });
});
