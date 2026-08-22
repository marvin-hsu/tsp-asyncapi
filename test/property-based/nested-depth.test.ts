import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../utils/test-host.js";
import { collectRefs, countKey } from "../utils/document.js";
import { resolveRef } from "../utils/json-pointer.js";

/**
 * What a deeply nested program does to the schema builder.
 *
 * Every other property in this directory searches width or an inheritance
 * chain. This one searches depth, which is the dimension none of them reach,
 * and depth is where `lower/schemas/declarations.ts` makes its three
 * decisions: promote an unspeakable declaration on its second use, claim a
 * key part way through a self-referencing build, and hand that key back when
 * the build throws.
 *
 * The generator emits TypeSpec source and nothing else. It does not build IR
 * nodes, so a change to the shape of the semantic model cannot break it.
 *
 * Every arm is constructed rather than filtered. An earlier plan for this file
 * proposed writing an anonymous model in a property position to reach the
 * promotion path; that is wrong, and measuring it is what showed it.
 * `buildNamedDeclaration` holds the promotion, and it only sees *named*
 * declarations. An anonymous model goes to `buildAnonymousDeclaration`, which
 * always inlines. The shape that promotes is an alias to a template
 * instantiation whose argument has no name of its own, referenced twice.
 */

/** A type that needs no declaration of its own. */
const leafType = fc.constantFrom("string", "int32", "float64", "boolean");

/**
 * A nested type expression, built by wrapping a leaf.
 *
 * The three wrappers are the ones a schema walk descends through: an array
 * descends into `items`, a `Record` into `additionalProperties`, and an
 * anonymous model into `properties`. Depth here is depth of the walk, which is
 * what the recursion guard counts.
 */
const nestedType = fc.letrec<{ type: string }>((tie) => ({
  type: fc.oneof(
    { maxDepth: 4, depthIdentifier: "type" },
    leafType,
    tie("type").map((inner) => `${inner}[]`),
    tie("type").map((inner) => `Record<${inner}>`),
    fc
      .tuple(tie("type"), fc.integer({ min: 0, max: 3 }))
      .map(([inner, n]) => `{ n${String(n)}: ${inner} }`),
  ),
})).type;

/** How many times one ladder level refers to the level below it. */
const useCount = fc.oneof(
  { arbitrary: fc.constant(2), weight: 3 },
  { arbitrary: fc.constant(1), weight: 1 },
);

/** The four ways a program can refer back to something it already declared. */
type CycleKind = "none" | "named-self" | "mutual" | "anon-alias" | "self-instantiation";

const cycleKind = fc.constantFrom<CycleKind>(
  "none",
  "named-self",
  "mutual",
  "anon-alias",
  "self-instantiation",
);

/** One generated program, with the facts about it the properties need. */
interface Generated {
  /** The whole of `main.tsp`, minus the import the tester adds. */
  readonly code: string;
  /** How many ladder levels the program declares. */
  readonly depth: number;
  /**
   * One property name per ladder level, each used by that level alone. A body
   * the emitter copied instead of referencing shows up as a repeated marker.
   */
  readonly markers: readonly string[];
  /** Which cycle the program holds, if any. */
  readonly cycle: CycleKind;
  /** How many ladder levels another level refers to twice. */
  readonly twiceUsed: number;
}

/**
 * The ladder: level `k` refers to level `k-1` once or twice.
 *
 * This is the shape `declarations.ts` quantifies in its own comment. Every
 * level is an alias to `Env<{...}>`, so none of them has a name of its own,
 * and a level two of its neighbours refer to is promoted to a component. A
 * level that is never referred to twice inlines instead. Both outcomes are
 * correct; what is not correct is emitting one level's body more than once.
 */
function ladder(uses: readonly number[]): { lines: string[]; markers: string[] } {
  const markers = ["leaf0"];
  const lines = ["model Env<T> { v: T; }", "alias S0 = Env<{ leaf0: string }>;"];
  uses.forEach((count, index) => {
    const level = index + 1;
    const marker = `leaf${String(level)}`;
    const refs = Array.from(
      { length: count },
      (_, slot) => `f${String(level)}x${String(slot)}: S${String(level - 1)}`,
    ).join(", ");
    lines.push(`alias S${String(level)} = Env<{ ${refs}, ${marker}: string }>;`);
    markers.push(marker);
  });
  return { lines, markers };
}

/** The declarations and the root field that one cycle kind contributes. */
function cycleArm(kind: CycleKind): { lines: string[]; field: string } {
  switch (kind) {
    case "named-self":
      return { lines: ["model SelfRef { next?: SelfRef; tag: string; }"], field: "sr: SelfRef" };
    case "mutual":
      return {
        lines: ["model LeftM { r?: RightM; }", "model RightM { l?: LeftM; }"],
        field: "mu: LeftM",
      };
    case "anon-alias":
      // The one arm that cannot be expressed as a schema at all. `alias` needs
      // no name for its right-hand side, so it is the only way to reach an
      // anonymous model that contains itself, and expanding it always leaves
      // another self-reference behind.
      return { lines: ["alias AnonCycle = { inner: AnonCycle };"], field: "ac: AnonCycle" };
    case "self-instantiation":
      return {
        lines: ["model Nd<T> { v: T; kids: Nd<T>[]; }"],
        field: "si: Nd<{ deep: string }>",
      };
    case "none":
      return { lines: [], field: "" };
  }
}

const generated: fc.Arbitrary<Generated> = fc
  .tuple(
    fc.array(useCount, { minLength: 1, maxLength: 6 }),
    cycleKind,
    fc.array(nestedType, { minLength: 1, maxLength: 3 }),
  )
  .map(([uses, cycle, nested]): Generated => {
    const { lines, markers } = ladder(uses);
    const arm = cycleArm(cycle);
    const plain = nested.map((type, index) => `p${String(index)}: ${type}`);
    const fields = [`r: S${String(uses.length)}`, ...plain, arm.field].filter(
      (field) => field !== "",
    );
    return {
      code: [...lines, ...arm.lines, `@AsyncAPI.message model Root { ${fields.join("; ")}; }`].join(
        "\n",
      ),
      depth: uses.length,
      markers,
      cycle,
      twiceUsed: uses.filter((count) => count === 2).length,
    };
  });

describe("Property: nested depth", () => {
  /**
   * The emitter answers, and every reference it wrote points at something.
   *
   * Two failures are possible here that no shallow program reaches. A cycle
   * the guard misses recurses until the stack goes, and a key claimed part way
   * through a build that then fails leaves a `$ref` aimed at a component that
   * never arrives. Neither shows up as a wrong value; the first throws and the
   * second dangles.
   *
   * The unrepresentable cycle is the one input that must be *reported*. The
   * other three back-references are all expressible, so they are expected to
   * pass without a diagnostic, and the property says so by requiring an error
   * exactly when the anonymous alias cycle is present.
   */
  it("answers for any depth, and writes no reference it cannot resolve", async () => {
    let deep = 0;
    let cyclic = 0;
    let reportedCycle = 0;
    let refsChecked = 0;

    await fc.assert(
      fc.asyncProperty(generated, async ({ code, depth, cycle }) => {
        if (depth >= 4) deep++;
        if (cycle !== "none") cyclic++;

        // A throw escaping here is the failure, so it is deliberately not
        // caught. `emitDocumentWithDiagnostics` reports rather than throws for
        // every case the emitter has an answer for.
        const { doc, diagnostics } = await emitDocumentWithDiagnostics(code);

        const codes = diagnostics.map((diagnostic) => diagnostic.code);
        const unrepresentable = codes.includes("tsp-asyncapi/unrepresentable-circular-reference");
        if (unrepresentable) reportedCycle++;

        // The anonymous alias cycle is the only generated shape a plain schema
        // cannot express. It must be reported, and no other shape may be.
        expect(unrepresentable).toBe(cycle === "anon-alias");

        // The emitter still writes a document when it reports this, so the
        // reference check below applies to every case.
        expect(doc).not.toBeNull();

        for (const ref of collectRefs(doc)) {
          refsChecked++;
          expect(resolveRef(doc, ref)).toBeDefined();
        }
      }),
      { numRuns: 120, seed: 20260815 },
    );

    // Depth is the whole point of this file, so a run that stayed shallow
    // would prove nothing. The other three say the cycle arms were built and
    // that the reference walk had something to walk.
    expect(deep).toBeGreaterThan(0);
    expect(cyclic).toBeGreaterThan(0);
    expect(reportedCycle).toBeGreaterThan(0);
    expect(refsChecked).toBeGreaterThan(0);
  });
  /**
   * No shape's body is emitted more than once.
   *
   * This is the guarantee the depth dimension exists for, and the
   * implementation quantifies the failure itself: a ladder where each level
   * refers to the level below twice emits two-to-the-depth copies of the
   * innermost shape, measured at over a megabyte from about twenty lines of
   * TypeSpec. Promoting a shape to a component on its second use is what keeps
   * that from happening.
   *
   * The claim is stated as duplication rather than as promotion on purpose.
   * Which shapes become components is a judgement about which document reads
   * better, and a later change of mind there should not fail a test. Emitting
   * one body twice is a defect under any such judgement, and it is what a
   * reader suffers: two copies that can drift apart with no sign they were
   * ever the same shape.
   *
   * Each ladder level carries a property name no other level uses, so counting
   * that name over the whole document counts the copies of that level's body.
   * The generator knows those names because it wrote them, so nothing here
   * reads the rule it is checking.
   */
  it("emits no shape's body more than once, however deep the nesting", async () => {
    let deep = 0;
    let promoted = 0;
    let markersCounted = 0;

    await fc.assert(
      fc.asyncProperty(generated, async ({ code, depth, markers, twiceUsed }) => {
        if (depth >= 4) deep++;
        if (twiceUsed > 0) promoted++;

        const { doc } = await emitDocumentWithDiagnostics(code);

        for (const marker of markers) {
          markersCounted++;
          // One occurrence is the body. Two or more is a copy, and the count
          // doubles for every level below the one that duplicated.
          expect(countKey(doc, marker)).toBe(1);
        }
      }),
      { numRuns: 120, seed: 20260815 },
    );

    // A ladder whose levels are each used once never reaches the promotion
    // path, so a run without `promoted` would say nothing about it.
    expect(deep).toBeGreaterThan(0);
    expect(promoted).toBeGreaterThan(0);
    expect(markersCounted).toBeGreaterThan(0);
  });
});
