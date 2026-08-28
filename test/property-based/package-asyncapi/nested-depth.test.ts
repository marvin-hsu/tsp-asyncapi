import { describe, it, expect } from "vitest";
import { hasError } from "../../utils/diagnostics.js";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { countKey } from "../../utils/document.js";
import { referencesIn } from "../../utils/references.js";
import { resolveRef } from "../../utils/json-pointer.js";

/**
 * What a deeply nested program does to the schema builder.
 *
 * Every other property in this directory searches width or an inheritance
 * chain. This one searches depth.
 *
 * `lower/schemas/declarations.ts` makes three decisions at depth. It
 * promotes an unspeakable declaration on its second use. It claims a key
 * part way through a self-referencing build. It hands that key back when
 * the build throws.
 *
 * The generator emits TypeSpec source directly, not IR nodes. A change to
 * the semantic model's shape cannot break it.
 *
 * Every arm is constructed, not filtered. `buildNamedDeclaration` holds
 * the promotion, and it only sees named declarations. An anonymous model
 * goes to `buildAnonymousDeclaration`, which always inlines.
 *
 * The shape that promotes is an alias to a template instantiation. Its
 * argument has no name of its own, and it is referenced twice.
 */

/** A type that needs no declaration of its own. */
const leafType = fc.constantFrom("string", "int32", "float64", "boolean");

/**
 * A nested type expression, built by wrapping a leaf.
 *
 * A schema walk descends through three wrappers. An array descends into
 * `items`, a `Record` into `additionalProperties`, and an anonymous model
 * into `properties`. Depth here is depth of the walk, and that is what
 * the recursion guard counts.
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

/**
 * A declaration whose schema body is decided by a count rather than a shape.
 *
 * An empty union and an empty enum are the two places this emitter must
 * stand something in for. `anyOf: []` means "no variant", and `enum: []`
 * means "no member", but neither is legal draft-07. Both guards return
 * `{ not: {} }` instead.
 *
 * These are the only edits in the schema walk that turn an accepted
 * document into a rejected one. That is why they are generated here, not
 * only at the top level.
 *
 * The three non-empty kinds keep the parser from seeing only the empty
 * ones on this path. A string-literal union collapses to one `enum`. A
 * mixed union becomes `anyOf`. An enum carries its members.
 */
type AuxKind = "empty-union" | "empty-enum" | "string-union" | "mixed-union" | "enum";

const auxKind = fc.constantFrom<AuxKind>(
  "empty-union",
  "empty-enum",
  "string-union",
  "mixed-union",
  "enum",
);

function auxDeclaration(kind: AuxKind, name: string): string {
  switch (kind) {
    case "empty-union":
      return `union ${name} { }`;
    case "empty-enum":
      return `enum ${name} { }`;
    case "string-union":
      return `union ${name} { "a", "b" }`;
    case "mixed-union":
      return `union ${name} { string, int32 }`;
    case "enum":
      return `enum ${name} { A, B }`;
  }
}

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
  /** The count-decided declarations the program holds, at whatever level. */
  readonly aux: readonly AuxKind[];
}

/**
 * The ladder: level `k` refers to level `k-1` once or twice.
 *
 * This is the shape `declarations.ts` quantifies in its own comment. Every
 * level is an alias to `Env<{...}>`, so none of them has a name of its own.
 * A level two of its neighbours refer to is promoted to a component. A
 * level that is never referred to twice inlines instead. Both outcomes are
 * correct. Emitting one level's body more than once is not.
 */
function ladder(
  uses: readonly number[],
  extras: readonly (readonly string[])[],
): { lines: string[]; markers: string[] } {
  const markers = ["leaf0"];
  const at = (level: number): string => (extras[level] ?? []).map((field) => `, ${field}`).join("");
  const lines = ["model Env<T> { v: T; }", `alias S0 = Env<{ leaf0: string${at(0)} }>;`];
  uses.forEach((count, index) => {
    const level = index + 1;
    const marker = `leaf${String(level)}`;
    const refs = Array.from(
      { length: count },
      (_, slot) => `f${String(level)}x${String(slot)}: S${String(level - 1)}`,
    ).join(", ");
    lines.push(`alias S${String(level)} = Env<{ ${refs}, ${marker}: string${at(level)} }>;`);
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
      // no name for its right-hand side. That makes it the only way to reach
      // an anonymous model that contains itself. Expanding it always leaves
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
    fc.array(auxKind, { minLength: 1, maxLength: 3 }),
  )
  .map(([uses, cycle, nested, aux]): Generated => {
    // Each auxiliary declaration is referred to from a ladder level, not from
    // `Root`. Its schema then sits under as many wrappers as that level is
    // deep. Level 0 is the deepest, so the first one goes there.
    const extras: string[][] = Array.from({ length: uses.length + 1 }, () => []);
    const auxLines = aux.map((kind, index) => {
      const name = `Aux${String(index)}`;
      extras[index % extras.length]?.push(`a${String(index)}?: ${name}`);
      return auxDeclaration(kind, name);
    });
    const { lines, markers } = ladder(uses, extras);
    const arm = cycleArm(cycle);
    const plain = nested.map((type, index) => `p${String(index)}: ${type}`);
    const fields = [`r: S${String(uses.length)}`, ...plain, arm.field].filter(
      (field) => field !== "",
    );
    return {
      code: [
        ...auxLines,
        ...lines,
        ...arm.lines,
        `@AsyncAPI.message model Root { ${fields.join("; ")}; }`,
      ].join("\n"),
      depth: uses.length,
      markers,
      cycle,
      twiceUsed: uses.filter((count) => count === 2).length,
      aux,
    };
  });

describe("Property: nested depth", () => {
  /**
   * The emitter answers, and every reference it wrote points at something.
   *
   * Two failures are possible here that no shallow program reaches. A cycle
   * the guard misses recurses until the stack goes. A key claimed part way
   * through a build, if that build then fails, leaves a `$ref` aimed at
   * nothing. Neither shows up as a wrong value. The first throws, and the
   * second dangles.
   *
   * The unrepresentable cycle is the one input that must be reported. The
   * other three back-references are expressible. The property requires an
   * error exactly when the anonymous alias cycle is present, and none
   * otherwise.
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

        for (const ref of referencesIn(doc)) {
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
   * This is the guarantee the depth dimension exists for. A ladder where
   * each level refers to the level below twice emits two-to-the-depth
   * copies of the innermost shape. That measured at over a megabyte from
   * about twenty lines of TypeSpec. Promoting a shape to a component on
   * its second use is what keeps that from happening.
   *
   * The claim is stated as duplication rather than promotion, on purpose.
   * Which shapes become components is a judgement call that should not
   * fail a test. Emitting one body twice is a defect under any such
   * judgement. A reader suffers two copies that can drift apart with no
   * sign they were ever the same shape.
   *
   * Each ladder level carries a property name no other level uses.
   * Counting that name over the document counts the copies of that
   * level's body. The generator wrote those names, so nothing here reads
   * the rule it is checking.
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
  /**
   * The official parser accepts whatever the emitter produced.
   *
   * This is the only property in the directory whose oracle is another
   * implementation, not a rule this repository wrote down. The official
   * parser was written against the specification by people who never saw
   * this emitter. It cannot be wrong in the same direction as the code it
   * checks.
   *
   * The target is narrow, and it was measured rather than assumed. The
   * parser validates payload schemas at any depth, but almost nothing
   * this emitter emits is actually invalid. A schema missing `type` is
   * weaker, not illegal. An empty `required` or `properties` is legal.
   *
   * The two edits that do cross the line are the guards for an empty
   * union and an empty enum. `anyOf: []` and `enum: []` are illegal
   * draft-07, and each guard returns `{ not: {} }` instead. Those two
   * guards are pinned elsewhere with a stronger assertion that fixes the
   * stand-in value. What this property adds is reach. Here the empty
   * union sits under as many wrappers as the ladder is deep, and the
   * parser, not this repository, decides whether the result is a
   * document at all.
   *
   * One parse costs roughly ten compilations, and CI runs about four
   * times slower than the machine this was written on. Sixty runs
   * measured 4.9s here and timed out against the twenty-second ceiling in
   * `vitest.config.ts` there. The run count below is the floor that still
   * reaches both guards with room. Every draw carries at least one
   * auxiliary declaration. At sixty runs, a quarter of the draws carried
   * none and spent a parse on a document no edit to this walk can
   * invalidate.
   */
  it("emits a document the official parser accepts, at any depth", async () => {
    let deep = 0;
    let emptyUnion = 0;
    let emptyEnum = 0;

    await fc.assert(
      fc.asyncProperty(generated, async ({ code, depth, aux }) => {
        const { doc, diagnostics } = await emitDocumentWithDiagnostics(code);

        // The unrepresentable cycle is reported as an error, and a document
        // the emitter has already refused says nothing about the parser. The
        // first property is the one that pins that case.
        fc.pre(!hasError(diagnostics));

        if (depth >= 4) deep++;
        if (aux.includes("empty-union")) emptyUnion++;
        if (aux.includes("empty-enum")) emptyEnum++;

        await expect(doc).toBeValidAsyncAPI();
      }),
      { numRuns: 20, seed: 20260815 },
    );

    // The two counters below are the reason this property is worth its cost.
    // A run that drew neither empty declaration would hand the parser only
    // documents no plausible edit can make invalid, and would pass whatever
    // the schema walk did.
    expect(deep).toBeGreaterThan(0);
    expect(emptyUnion).toBeGreaterThan(0);
    expect(emptyEnum).toBeGreaterThan(0);
  });
});
