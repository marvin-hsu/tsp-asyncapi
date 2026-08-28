import { describe, it, expect } from "vitest";
import { hasError } from "../../utils/diagnostics.js";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";

/**
 * No `$ref` carries a sibling keyword.
 *
 * AsyncAPI 3.x schemas default to JSON Schema draft-07. There, a `$ref`
 * replaces the whole object around it, so a reader ignores every other
 * key beside it. A sibling `description` or `minLength` is silently
 * discarded. A sibling `discriminator` or `type` is worse. It looks
 * like a constraint on the referenced schema, but constrains nothing.
 *
 * Four code paths each decide separately whether to wrap a `$ref`
 * before adding a sibling. `withPropertyDocs` wraps a property's `$ref`
 * in `allOf` when the property carries `@doc`, `@summary`, `@example`,
 * use-site validation, or `@jsonSchemaExtension`.
 * `hoistAnnotationsAboveAllOf` lifts annotations above that wrap.
 * `applyExtends` puts a base model's `$ref` into an `allOf` branch.
 * `applyDiscriminator` adds `discriminator` to the wrapper object, not
 * the branch. Each can regress alone, so the rule is checked over the
 * whole document, not one function.
 *
 * The walk covers the whole document, not only `components.schemas`. An
 * AsyncAPI reference object forbids siblings for the same reason.
 *
 * The official AsyncAPI parser accepts a sibling beside a `$ref`
 * without complaint, so nothing else in this suite guards this rule.
 *
 * The generator draws properties that reach both routes into this
 * region. A bare-`$ref` wrapper, and a `$ref` buried under `items`,
 * `additionalProperties`, `anyOf`, or `oneOf`. Two counters, scoped to
 * the drawn properties, confirm both routes are reached. Counting
 * wrappers anywhere in the document would not do this. `model Derived
 * extends Inner` always produces one, so an unscoped counter would
 * pass without ever watching the drawn dimensions.
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
 * `validation` names the use-site validation decorator legal on the type,
 * or `null` when none is. TypeSpec rejects `@minItems` on a non-array and
 * `@minLength` on a non-string, so a mismatched pair never reaches the
 * emitter.
 *
 * `objectExample` marks a type that `@example(#{ a: "x" })` accepts: only
 * `Inner` and the types built from it.
 *
 * The list mixes types that build to a bare `$ref` with types that bury one
 * under `items`, `additionalProperties`, or `anyOf`. The first group reaches
 * the wrap branch; the second reaches the merge-beside-a-container branch.
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
 * `wrapped` marks an `allOf` holding a bare `$ref`: the shape
 * `withPropertyDocs`, `applyExtends`, and `applyDiscriminator` build before
 * adding anything beside a reference.
 *
 * `buried` marks the other route: the `$ref` sits under `items`,
 * `additionalProperties`, `anyOf`, or `oneOf`, and annotations merge onto
 * the container instead. It is counted separately, since a regression here
 * never changes a wrapper count.
 *
 * The scan starts at the property's own schema, not the whole document. The
 * document always holds the hardcoded wrapper from
 * `model Derived extends Inner`, so a document-wide count would be
 * constant-true and would watch none of the drawn dimensions.
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
        const { doc, diagnostics } = await emitDocumentWithDiagnostics(render(draw));

        // The claim starts once the emitter has answered with a document.
        // A program TypeSpec refuses tests nothing. Warnings are kept: a
        // path that reports one still emits a document.
        fc.pre(doc !== null && !hasError(diagnostics));

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
  });
});
