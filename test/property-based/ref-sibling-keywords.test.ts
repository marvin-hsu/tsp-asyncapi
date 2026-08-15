/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { emitAsyncAPIWithDiagnostics } from "../utils/test-host.js";

/**
 * No `$ref` carries a sibling keyword.
 *
 * AsyncAPI 3.x schemas default to JSON Schema draft-07. In that dialect a
 * `$ref` replaces the whole object it sits in. A reader ignores every
 * other key next to it. A sibling `description`, `minLength`, or `x-`
 * extension is then silently discarded by the consumer. It still looks
 * present in the document, so nobody notices. A sibling `discriminator`
 * or `type` is worse. It reads as if it constrains the referenced schema,
 * and it constrains nothing.
 *
 * Four code paths each decide separately whether to wrap a `$ref` before
 * putting anything beside it. `withPropertyDocs` wraps a property's
 * `$ref` in `allOf` when the property carries its own `@doc`, `@summary`,
 * `@example`, use-site validation, or `@jsonSchemaExtension`.
 * `hoistAnnotationsAboveAllOf` lifts annotations above that wrap.
 * `applyExtends` puts a base model's `$ref` into an `allOf` branch.
 * `applyDiscriminator` adds `discriminator` to the wrapper object, not to
 * the branch. Each of them can regress alone. So the rule is stated over
 * the whole emitted document, not over one function.
 *
 * The walk covers the whole document, not only `components.schemas`. An
 * AsyncAPI reference object forbids siblings for the same reason.
 *
 * REACHABILITY, measured in this worktree.
 *
 * A probe first emitted 34 hand-written programs and scanned each one
 * with this same walk. It measured:
 *
 *   programs that produced an `allOf` wrapper holding a bare `$ref`   18
 *   programs with no such wrapper                                     15
 *   programs the compiler refused                                      1
 *   `$ref` objects carrying a sibling key                              0
 *
 * The 18 wrapping programs reach all four paths: `@doc`, `@summary`,
 * `@example`, and `@jsonSchemaExtension` on a model-typed property;
 * `extends`; an empty derived model; `@discriminator` over a two-level
 * and a three-level chain; a self-referencing model; an `@oneOf` union
 * and an enum behind a documented property; a union variant's own `@doc`.
 *
 * The 15 non-wrapping programs matter as much. They reach the same
 * document region by a different route, so a regression there would not
 * show up in a wrapper count. Measured shapes, for `@doc("x")
 * @minItems(1) @maxItems(3) i: Inner[]`:
 *
 *   { type: "array", items: { $ref }, description, minItems, maxItems }
 *
 * `Record<Inner>` merges the same way next to `additionalProperties`.
 * `@doc @summary n?: Inner | null` produces
 * `{ anyOf: [{ $ref }, { type: "null" }], title, description }`, so the
 * ref sits in a branch. A `@minLength` on a property of an
 * already-constrained scalar takes the collision branch of
 * `withPropertyDocs` instead of the `$ref` branch.
 *
 * The generator below was then instrumented over its 150 runs, with seed
 * 20260815 pinned in the call. It measured:
 *
 *   documents emitted                                                150
 *   programs the compiler refused                                      0
 *   documents with a drawn property holding a bare-`$ref` wrapper     117
 *   documents with a drawn property that buries a `$ref`               87
 *
 * Both counts are scoped to the drawn properties `p0` to `p4`, and both
 * are asserted after the search. An earlier version counted wrappers
 * anywhere in the document. That count was constant-true: `render` always
 * writes `model Derived extends Inner` and `d: Derived`, and `applyExtends`
 * turns that pair into a bare-`$ref` `allOf` wrapper on every draw. The
 * smallest program the generator can produce was measured at one wrapper.
 * So the old guard fired on the hardcoded lines alone, and watched none of
 * the drawn dimensions.
 *
 * Also measured, by running the official AsyncAPI parser over a
 * hand-made document whose message payload is
 * `{ $ref: "#/components/schemas/Inner", description: "sibling" }`: the
 * parser returns one diagnostic, at severity 2 (information), about the
 * document version. It reports no error. So neither the parser nor
 * anything else in this suite guards this rule.
 *
 * The two final assertions keep that reachability claim alive at run time.
 * If the generator or the emitter drifts so that no drawn property reaches
 * a wrapper, or none buries a `$ref`, the property would pass without
 * touching what it is about. An assertion fails instead.
 */

/** One property of the generated `Root` message, before rendering. */
interface PropDecl {
  kind: number;
  doc: boolean;
  summary: boolean;
  extension: boolean;
  validation: boolean;
  example: boolean;
}

/**
 * The property types the generator draws from.
 *
 * `validation` names the use-site validation decorator that is legal on
 * the type, or `null` when none is. TypeSpec rejects `@minItems` on a
 * non-array and `@minLength` on a non-string. Such a program never
 * reaches the emitter, so it would test nothing.
 *
 * `objectExample` marks a type an `@example(#{ a: "x" })` is valid for.
 * That is the one literal the generator writes, so only `Inner` and the
 * types that hold an `Inner` shape accept it.
 *
 * The list mixes types that build to a bare `$ref` with types that bury
 * a `$ref` under `items`, `additionalProperties`, or `anyOf`. Both
 * groups are needed. Only the first reaches the wrap branch. Only the
 * second reaches the merge-beside-a-container branch.
 */
const PROP_KINDS: readonly {
  type: string;
  validation: string | null;
  objectExample: boolean;
}[] = [
  { type: "Inner", validation: null, objectExample: true },
  { type: "Inner[]", validation: "@minItems(1)", objectExample: false },
  { type: "Record<Inner>", validation: null, objectExample: false },
  { type: "MyStr", validation: "@minLength(3)", objectExample: false },
  { type: "E", validation: null, objectExample: false },
  { type: "U", validation: null, objectExample: false },
  { type: "Inner[][]", validation: "@maxItems(4)", objectExample: false },
  { type: "Pet", validation: null, objectExample: false },
  { type: "Dog", validation: null, objectExample: false },
  { type: "Inner | null", validation: null, objectExample: false },
  { type: "string", validation: "@minLength(2)", objectExample: false },
  { type: "Node", validation: null, objectExample: false },
  { type: "Derived", validation: null, objectExample: false },
];

const propArb = fc.record({
  kind: fc.integer({ min: 0, max: PROP_KINDS.length - 1 }),
  doc: fc.boolean(),
  summary: fc.boolean(),
  extension: fc.boolean(),
  validation: fc.boolean(),
  example: fc.boolean(),
});

const programArb = fc.record({
  props: fc.array(propArb, { minLength: 1, maxLength: 5 }),
  // A `@doc` on the derived model itself. `applyExtends` then produces
  // the `allOf` wrap, and `withDocs` merges an annotation onto the same
  // schema. That pairs the two decisions on one object.
  derivedDoc: fc.boolean(),
  // A third level under the discriminated base. `applyDiscriminator`
  // then sees a chain instead of a single derived model.
  deepDiscriminated: fc.boolean(),
  // Switches the named union between `anyOf` and `oneOf`. Both hold the
  // variants' refs as branches.
  oneOfUnion: fc.boolean(),
});

/** Renders one drawn property as a TypeSpec declaration line. */
function renderProp(prop: PropDecl, index: number): string {
  const kind = PROP_KINDS[prop.kind];
  const decorators: string[] = [];
  if (prop.doc) decorators.push(`@doc("d${String(index)}")`);
  if (prop.summary) decorators.push(`@summary("s${String(index)}")`);
  if (prop.extension) decorators.push(`@jsonSchemaExtension("x-k${String(index)}", "v")`);
  if (prop.validation && kind.validation !== null) decorators.push(kind.validation);
  if (prop.example && kind.objectExample) decorators.push(`@example(#{ a: "x" })`);
  const head = decorators.length > 0 ? decorators.join(" ") + " " : "";
  return `${head}p${String(index)}?: ${kind.type};`;
}

/** Renders a whole drawn program as TypeSpec source. */
function render(draw: {
  props: readonly PropDecl[];
  derivedDoc: boolean;
  deepDiscriminated: boolean;
  oneOfUnion: boolean;
}): string {
  const lines = [
    "model Inner { a: string; }",
    // A self-reference. Its schema holds a `$ref` back to itself, so the
    // property paths run on a schema that is already being built.
    "model Node { a: string; next?: Node; }",
    "@minLength(1) scalar MyStr extends string;",
    "enum E { a, b }",
    `${draw.oneOfUnion ? "@oneOf " : ""}union U { i: Inner, s: string }`,
    `@discriminator("kind") model Pet { kind: string; }`,
    `model Dog extends Pet { kind: "dog"; bark: boolean; }`,
  ];
  if (draw.deepDiscriminated) {
    lines.push(`model Puppy extends Dog { weeks: int32; }`);
    // Referenced so the model is emitted at all.
    lines.push(`model PuppyHolder { p: Puppy; }`);
  }
  lines.push(
    `${draw.derivedDoc ? '@doc("derived") ' : ""}model Derived extends Inner { b: string; }`,
  );
  const body = draw.props.map((prop, index) => renderProp(prop, index)).join(" ");
  const extra = draw.deepDiscriminated ? " h: PuppyHolder;" : "";
  return [...lines, `@AsyncAPI.message model Root { d: Derived;${extra} ${body} }`].join("\n");
}

/** One offending object, with the JSON Pointer path that leads to it. */
interface Violation {
  path: string;
  node: string;
}

/**
 * Walks every object in `node`.
 *
 * It records each object that holds `$ref` next to any other key. The walk
 * covers the whole document, since every one of the four wrap paths can
 * regress on its own.
 */
function walk(node: unknown, path: string, violations: Violation[]): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => {
      walk(child, `${path}/${String(index)}`, violations);
    });
    return;
  }
  const record = node as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.includes("$ref") && keys.length > 1) {
    violations.push({ path, node: JSON.stringify(record) });
  }
  for (const key of keys) {
    walk(record[key], `${path}/${key}`, violations);
  }
}

/** What one drawn property's schema subtree reached. */
interface PropReach {
  wrapped: boolean;
  buried: boolean;
}

/**
 * Scans the schema of one drawn property.
 *
 * `wrapped` marks the wrap branch: an `allOf` holding a bare `$ref`. That
 * is the shape `withPropertyDocs`, `applyExtends`, and `applyDiscriminator`
 * build before they put anything beside a reference.
 *
 * `buried` marks the other route into the same document region. The `$ref`
 * sits under `items`, `additionalProperties`, `anyOf`, or `oneOf`, and the
 * annotations merge onto the container instead. A regression there never
 * changes a wrapper count, so it is counted on its own.
 *
 * The scan starts at the property's own schema, not at the whole document.
 * The document always holds the wrapper that `model Derived extends Inner`
 * produces, and that line is hardcoded. A document-wide count would
 * therefore be constant-true and would watch none of the drawn dimensions.
 */
function scanProperty(node: unknown, reach: PropReach): void {
  if (node === null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) scanProperty(child, reach);
    return;
  }
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.allOf) && record.allOf.some(isBareRef)) {
    reach.wrapped = true;
  }
  for (const key of ["items", "additionalProperties"]) {
    if (isBareRef(record[key])) reach.buried = true;
  }
  for (const key of ["anyOf", "oneOf"]) {
    const branches = record[key];
    if (Array.isArray(branches) && branches.some(isBareRef)) reach.buried = true;
  }
  for (const value of Object.values(record)) {
    scanProperty(value, reach);
  }
}

/** True when `value` is an object whose only key is `$ref`. */
function isBareRef(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "$ref";
}

describe("Integration: Schemas — no $ref carries sibling keywords", () => {
  it("never puts another key beside a $ref", async () => {
    let wrapDocs = 0;
    let buryDocs = 0;

    await fc.assert(
      fc.asyncProperty(programArb, async (draw) => {
        const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(render(draw));

        // The claim starts once the emitter has answered with a document.
        // A program TypeSpec refuses tests nothing. Warnings are kept: a
        // path that reports one still emits a document.
        fc.pre(doc !== null && !diagnostics.some((d) => d.severity === "error"));

        const violations: Violation[] = [];
        walk(doc, "", violations);

        // Only the drawn properties are counted, so the record reacts to
        // the draw. `d: Derived` is hardcoded and is skipped.
        const schemas = (doc as { components?: { schemas?: Record<string, unknown> } }).components
          ?.schemas;
        const root = schemas?.Root as { properties?: Record<string, unknown> } | undefined;
        const properties = root?.properties ?? {};
        const reach: PropReach = { wrapped: false, buried: false };
        for (const [name, schema] of Object.entries(properties)) {
          if (!name.startsWith("p")) continue;
          scanProperty(schema, reach);
        }
        if (reach.wrapped) wrapDocs++;
        if (reach.buried) buryDocs++;

        // `violations` carries the path and the offending object, so a
        // failure names the exact place instead of only a count.
        expect(violations).toEqual([]);
      }),
      { numRuns: 150, seed: 20260815 },
    );

    // Both routes into the region have to be reached. The wrap branch is
    // where a sibling would be added beside a bare `$ref`. The container
    // branch is where annotations merge next to a buried `$ref`.
    expect(wrapDocs).toBeGreaterThan(0);
    expect(buryDocs).toBeGreaterThan(0);
  }, 120000);
});
