import {
  Type,
  Model,
  ModelProperty,
  Scalar,
  IntrinsicType,
  Enum,
  EnumMember,
  Union,
  UnionVariant,
  Namespace,
  Program,
  StringLiteral,
  Value,
  IndeterminateEntity,
  isArrayModelType,
  isRecordModelType,
  walkPropertiesInherited,
  getDoc,
  getSummary,
  getExamples,
  serializeValueAsJson,
  UnserializableValueError,
  resolveEncodedName,
  $example,
  Example,
  getSourceLocation,
  EncodeData,
  getPattern,
  getFormat,
  getMinValueAsNumeric,
  getMaxValueAsNumeric,
  getMinValueExclusiveAsNumeric,
  getMaxValueExclusiveAsNumeric,
  getMinValueForScalar,
  getMaxValueForScalar,
  getMinValueExclusiveForScalar,
  getMaxValueExclusiveForScalar,
  getMinLengthAsNumeric,
  getMaxLengthAsNumeric,
  getMinItemsAsNumeric,
  getMaxItemsAsNumeric,
  getDiscriminator,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../types/index.js";
import { reportDiagnostic } from "../lib.js";

/**
 * Builds `{ name: { type, format } }` entries for scalars that map to a
 * formatted primitive schema.
 */
function withFormat(type: string, formats: Record<string, string>): Record<string, SchemaObject> {
  return Object.fromEntries(
    Object.entries(formats).map(([name, format]) => [name, { type, format }]),
  );
}

/**
 * TypeSpec built-in scalar name → AsyncAPI schema.
 */
const SCALAR_SCHEMAS: Record<string, SchemaObject> = {
  string: { type: "string" },
  boolean: { type: "boolean" },
  // Abstract numeric scalars: the width is unspecified, so no `format`.
  numeric: { type: "number" },
  integer: { type: "integer" },
  float: { type: "number" },
  ...withFormat("integer", {
    int8: "int8",
    int16: "int16",
    int32: "int32",
    int64: "int64",
    safeint: "int64",
    uint8: "uint8",
    uint16: "uint16",
    uint32: "uint32",
    uint64: "uint64",
  }),
  ...withFormat("number", {
    float32: "float",
    float64: "double",
    decimal: "decimal",
    decimal128: "decimal128",
  }),
  ...withFormat("string", {
    bytes: "byte",
    plainDate: "date",
    plainTime: "time",
    utcDateTime: "date-time",
    offsetDateTime: "date-time",
    duration: "duration",
    url: "uri",
  }),
};

/**
 * True when `scalar` is one of TypeSpec's own built-in scalars (declared in
 * the global `TypeSpec` namespace), as opposed to a user-declared scalar that
 * merely happens to share a name with one (e.g. a `namespace MyLib { scalar
 * duration extends int32; }`). Only built-ins should be looked up directly in
 * `SCALAR_SCHEMAS` by name — a user scalar must instead walk `baseScalar`.
 */
function isBuiltinScalar(scalar: Scalar): boolean {
  const ns = scalar.namespace;
  return ns?.name === "TypeSpec" && !ns.namespace?.name;
}

/**
 * True when `model` is the built-in `Array`/`Record` template instantiated
 * anonymously at a use site (e.g. `string[]`, `Record<int32>`), as opposed to
 * a user's own named alias declared with `is` (e.g. `model Names is
 * string[];`). Only the anonymous use site should stay inlined — a named
 * alias is a real declaration and must be registered like any other named
 * model. TypeSpec's built-in `Array`/`Record` templates live directly in the
 * global `TypeSpec` namespace; a user-declared alias never does.
 */
function isBuiltinCollectionInstantiation(model: Model): boolean {
  const ns = model.namespace;
  return ns?.name === "TypeSpec" && !ns.namespace?.name;
}

/**
 * True when `prop` is `never`-typed — the same condition `buildObjectSchema`
 * uses to skip a property entirely (it enters neither `properties` nor
 * `required`). Shared with `findDiscriminatingProperty` below so a
 * `never`-typed discriminating property is treated as "does not exist",
 * exactly as it does not exist in the emitted schema.
 */
function isNeverTypedProperty(prop: ModelProperty): boolean {
  return prop.type.kind === "Intrinsic" && prop.type.name === "never";
}

/**
 * Finds the property named `name` (by its TypeSpec declaration name, i.e.
 * `@discriminator("x")`'s `x` — see `applyDiscriminator`'s doc comment) on
 * `model` or any ancestor reached by walking `baseModel`. A derived model's
 * assembled schema is `{ allOf: [{ $ref: Base }, own] }`, so the
 * discriminating property may be declared on `Base` rather than `model`
 * itself; this walk keeps the presence check in agreement with the schema it
 * actually checks. `never`-typed properties are skipped (treated as
 * not-found) since `buildObjectSchema` never emits them either.
 */
function findDiscriminatingProperty(model: Model, name: string): ModelProperty | undefined {
  for (let current: Model | undefined = model; current !== undefined; current = current.baseModel) {
    for (const prop of current.properties.values()) {
      if (prop.name === name && !isNeverTypedProperty(prop)) {
        return prop;
      }
    }
  }
  return undefined;
}

/**
 * Finds an own property of `model` whose resolved wire name
 * (`resolveEncodedName(..., SCHEMA_ENCODING_MIME_TYPE)`) collides with an
 * ancestor property's (reached via `model.baseModel`) wire name in a way
 * `applyExtends`'s usual `{ allOf: [{ $ref: Base }, own] }` shape cannot
 * represent. `applyExtends` assembles that shape on the assumption that an
 * overriding property in `own` narrows the exact same key the base branch
 * constrains — that assumption breaks in two distinct ways:
 *
 * 1. **Same TypeSpec name, different wire name.** The override carries its
 *    own `@encodedName`, so `own` keys `properties`/`required` by the
 *    override's wire name while the base branch (a `$ref` to an
 *    already-built, shared schema) still keys the same conceptual property
 *    by the ancestor's wire name — both wire names end up required at once.
 * 2. **Different TypeSpec name, same wire name.** A *new* property `own`
 *    declares (not overriding any same-named ancestor property) happens to
 *    resolve, via its own `@encodedName`, to the same wire name an
 *    *unrelated* ancestor property already uses. The base branch and `own`
 *    then both constrain that one JSON key — with two independent,
 *    typically incompatible schemas — under `allOf`'s AND semantics.
 *
 * Either way, a payload built from `model` itself can never satisfy both
 * branches, so nothing validates. `applyExtends` uses this to detect the
 * conflict and fall back to a fully flattened schema (see
 * `SchemaBuilder.buildFlattenedObjectSchema`) instead.
 *
 * `never`-typed properties (own or ancestor) are skipped throughout, since
 * they contribute no key to the emitted schema either way (see
 * `isNeverTypedProperty`).
 */
interface EncodedNameOverrideConflict {
  property: ModelProperty;
  /** A phrase completing "Property \"x\" ${reason}", describing which of the
   * two conflict shapes (see the two numbered cases above) was found. */
  reason: string;
}

/**
 * Every ancestor property's wire name reachable through `model`'s
 * `baseModel` chain, first (i.e. most-derived) match winning — same
 * precedence `walkPropertiesInherited` gives an override.
 */
function collectAncestorWireNames(program: Program, baseModel: Model): Map<string, ModelProperty> {
  const ancestorWireNames = new Map<string, ModelProperty>();
  for (
    let current: Model | undefined = baseModel;
    current !== undefined;
    current = current.baseModel
  ) {
    for (const prop of current.properties.values()) {
      if (isNeverTypedProperty(prop)) {
        continue;
      }
      const wireName = resolveEncodedName(program, prop, SCHEMA_ENCODING_MIME_TYPE);
      if (!ancestorWireNames.has(wireName)) {
        ancestorWireNames.set(wireName, prop);
      }
    }
  }
  return ancestorWireNames;
}

/**
 * Checks a single own property of `model` for either of
 * `findEncodedNameOverrideConflict`'s two conflict shapes (see its doc
 * comment above). Split out so the per-property branching (each case is its
 * own early return) does not add to the caller's own loop-plus-branch
 * complexity.
 */
function checkPropertyEncodedNameConflict(
  program: Program,
  baseModel: Model,
  prop: ModelProperty,
  ancestorWireNames: Map<string, ModelProperty>,
): EncodedNameOverrideConflict | undefined {
  const ownWireName = resolveEncodedName(program, prop, SCHEMA_ENCODING_MIME_TYPE);
  const sameNameAncestor = findDiscriminatingProperty(baseModel, prop.name);
  if (sameNameAncestor !== undefined) {
    // Case 1: a same-named override. Only a conflict when the wire names
    // actually diverge — a consistent override (same name, same wire name,
    // e.g. no `@encodedName` at all) is not a conflict.
    const ancestorWireName = resolveEncodedName(
      program,
      sameNameAncestor,
      SCHEMA_ENCODING_MIME_TYPE,
    );
    if (ownWireName === ancestorWireName) {
      return undefined;
    }
    return {
      property: prop,
      reason: `overrides an inherited property but resolves to a different wire name ("${ownWireName}" vs "${ancestorWireName}") via @encodedName.`,
    };
  }
  // Case 2: no same-named ancestor, but this (new) property's wire name
  // still collides with a *different* ancestor property's wire name.
  if (ancestorWireNames.has(ownWireName)) {
    return {
      property: prop,
      reason:
        "resolves to the same wire name (via @encodedName) as a different, unrelated inherited property.",
    };
  }
  return undefined;
}

function findEncodedNameOverrideConflict(
  program: Program,
  model: Model,
): EncodedNameOverrideConflict | undefined {
  if (model.baseModel === undefined) {
    return undefined;
  }
  const ancestorWireNames = collectAncestorWireNames(program, model.baseModel);
  for (const prop of model.properties.values()) {
    if (isNeverTypedProperty(prop)) {
      continue;
    }
    const conflict = checkPropertyEncodedNameConflict(
      program,
      model.baseModel,
      prop,
      ancestorWireNames,
    );
    if (conflict !== undefined) {
      return conflict;
    }
  }
  return undefined;
}

/**
 * Finds an own property of `model` that is `never`-typed and overrides a
 * same-named, non-`never` ancestor property (reached via `model.baseModel`).
 * `never`-typed means "this property does not exist" (see
 * `isNeverTypedProperty`), and `buildObjectSchemaFromProperties` /
 * `walkPropertiesInherited` both honor that convention for a model built via
 * the flattened path. But `applyExtends`'s usual `{ allOf: [{ $ref: Base },
 * own] }` shape never consults the base's properties when assembling `own`,
 * so the inherited (non-`never`) property would still be required through
 * the `$ref` branch — silently contradicting the same TypeSpec input's
 * effective shape under the flattened path. `applyExtends` uses this to
 * route such a model through the same flattened fallback
 * (`SchemaBuilder.buildFlattenedObjectSchema`) instead, so both code paths
 * agree: the overridden property is dropped, not silently still required.
 */
function findNeverOverrideOfInheritedProperty(model: Model): ModelProperty | undefined {
  if (model.baseModel === undefined) {
    return undefined;
  }
  for (const prop of model.properties.values()) {
    if (!isNeverTypedProperty(prop)) {
      continue;
    }
    if (findDiscriminatingProperty(model.baseModel, prop.name) !== undefined) {
      return prop;
    }
  }
  return undefined;
}

/**
 * Returns the dot-separated fully qualified name of a named declaration
 * (e.g. `Foo.Bar.Model`). Declarations in the global namespace have no
 * prefix. Shared by every kind of named type that can be registered into
 * `components.schemas` (model, enum, named union).
 */
function getQualifiedName(name: string, namespace: Namespace | undefined): string {
  const parts = [name];
  let ns = namespace;
  while (ns?.name) {
    parts.unshift(ns.name);
    ns = ns.namespace;
  }
  return parts.join(".");
}

/**
 * Escapes a `components.schemas` key for use as a JSON Pointer token inside a
 * `$ref` (RFC 6901: `~` → `~0`, `/` → `~1`). Model/namespace identifiers can
 * contain arbitrary characters via backquoting, and a raw `/` or `~` would
 * otherwise produce a `$ref` that every conforming resolver misreads as a
 * path through nested objects. The key stored in `this.schemas` is left
 * unescaped — only the `$ref` string needs this.
 */
function toJsonPointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Upper-cases just the first character, leaving the rest of `text` as-is. */
function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Capitalized, dot-free concatenation of a namespace chain (e.g. `A.B` →
 * `"AB"`), used to prefix a `Model`/`Union` template argument's display name
 * with its namespace so two same-named models in different namespaces don't
 * collapse to the same template-instantiation name (review
 * 2026-08-14-114). The global namespace's name is `""`, so an unnamespaced
 * argument yields `""` and every pre-existing (unnamespaced) instantiation
 * name is unaffected.
 */
function namespacePrefix(namespace: Namespace | undefined): string {
  const parts: string[] = [];
  let ns = namespace;
  while (ns?.name) {
    // The compiler's built-in `TypeSpec` namespace (home of `Array`,
    // `Record`, and the other built-in collection types) sits directly
    // under the global namespace (`ns.namespace?.name === ""`). It isn't a
    // user namespace, so it shouldn't leak into a synthesized key the way a
    // real user namespace does (review 2026-08-14-118) — skip just this one
    // link in the chain and keep walking (a user namespace nested under it,
    // if that were even possible, would still be collected).
    if (ns.name === "TypeSpec" && ns.namespace?.name === "") {
      ns = ns.namespace;
      continue;
    }
    parts.unshift(capitalizeFirst(ns.name));
    ns = ns.namespace;
  }
  // Joined with `.` (legal in the AsyncAPI Components Object key charset,
  // `^[a-zA-Z0-9\.\-_]+$`), not concatenated bare: a bare join is not
  // injective — namespace `A.B` and a sibling top-level namespace `AB` would
  // otherwise both produce the prefix `"AB"` (review 2026-08-14-125). This
  // still leaves one narrower, accepted collision: `sanitizeLiteralDisplayName`
  // keeps `.` verbatim in a literal argument's own text, so a literal
  // containing `.` can compose the same name as an unrelated namespaced
  // argument (`P<"a.b">` vs. a model named `B` inside `namespace PA`) — left
  // to `findFreeKey`'s suffix ladder like the other rare, documented
  // collisions in this file, rather than introducing a second reserved
  // marker for what both call sites already treat as a safe passthrough
  // character.
  return parts.join(".");
}

/**
 * A human-legible display name for a literal template argument's value that
 * preserves separator characters instead of deleting them, so distinct
 * literals that differ only in their separators (`"user-created"` vs.
 * `"user_created"`) don't collapse to the same composed name (review
 * 2026-08-14-115). Splits on runs of non-alphanumeric characters, keeping
 * the separator runs verbatim and capitalizing only the alphanumeric
 * segments between them. A degenerate input that sanitizes to the empty
 * string (only the empty string itself — any actual separator character
 * survives, either verbatim or as the `Sep` stand-in described below) falls
 * back to a fixed non-empty token so it can't collapse the composed name
 * down to the bare template name.
 *
 * Only `-`, `_`, and `.` are kept verbatim — characters that
 * `refFor`/`toJsonPointerToken` don't already escape (`~`, `/`) and that are
 * otherwise unsafe or ambiguous inside a `$ref`'s URI fragment (`#`, space,
 * etc.) are each encoded as `Sep<codePoint>` (e.g. `#` → `Sep35`, a space →
 * `Sep32`) instead of passing through raw or collapsing to one indistinct
 * `Sep` token (review 2026-08-14-121). Distinct literals stay distinguishable
 * regardless of which unsafe separator character they use
 * (`"user#created"` → `UserSep35Created`, `"has space"` → `HasSep32Space`)
 * while the composed name is guaranteed never to carry a character that
 * would make the emitted `$ref` illegal or resolve to the wrong fragment.
 *
 * The alphanumeric segments (the `i % 2 === 0` branch below) are passed
 * through unescaped, which would let a literal that spells the escape
 * marker itself (e.g. `"ASep32B"`) compose the same name as a literal using
 * the real separator that marker encodes (e.g. `"A B"`) — a genuine,
 * non-injective collision in the escaping scheme (review 2026-08-14-124),
 * distinct from the intentional, accepted collisions `findFreeKey` already
 * handles. Any occurrence of the marker pattern itself (`Sep` immediately
 * followed by a digit) is therefore escaped to `SepSep` before composing, so
 * a literal payload can never be mistaken for an escaped separator.
 */
function sanitizeLiteralDisplayName(raw: string): string {
  if (raw.length === 0) {
    return "Empty";
  }
  const parts = raw.split(/([^\dA-Za-z]+)/);
  const out = parts
    .map((part, i) => {
      if (i % 2 === 0) {
        return capitalizeFirst(part.replace(/Sep(?=\d)/g, "SepSep"));
      }
      if (/^[-_.]+$/.test(part)) {
        return part;
      }
      return Array.from(part)
        .map((ch) => `Sep${String(ch.codePointAt(0) ?? 0)}`)
        .join("");
    })
    .join("");
  return out.length === 0 ? "Empty" : out;
}

/**
 * A human-legible display name for a numeric template argument's value that
 * encodes its sign and decimal point instead of deleting them, so `-1` and
 * `1` (and `1.5` and `15`) don't collapse to the same composed name (review
 * 2026-08-14-112).
 *
 * Built from the compiler's `NumericLiteral.valueAsString` (the literal's
 * original source text) rather than `String(value)`: `String()` round-trips
 * through a JS `number`, which is both lossy for values outside the safe
 * integer/precision range and, for very large or very small magnitudes,
 * renders in exponent notation with a `+` (e.g. `1e+21`) — a character the
 * AsyncAPI 3.0 Components Object key charset (`^[a-zA-Z0-9\.\-_]+$`) forbids,
 * which would otherwise leak unescaped into the `components.schemas` key and
 * the emitted `$ref` (review 2026-08-14-122). Any character the source text
 * can still carry that isn't already handled (`+` from source-level exponent
 * signs, in particular) is Sep-encoded the same way
 * `sanitizeLiteralDisplayName` encodes unsafe separators, so the composed
 * name can never carry a charset-violating character.
 */
function sanitizeNumberDisplayName(valueAsString: string): string {
  const text = valueAsString;
  const negative = text.startsWith("-");
  const magnitudeText = (negative ? text.slice(1) : text).replaceAll(".", "_");
  const magnitude = Array.from(magnitudeText)
    .map((ch) => (/[A-Za-z0-9_]/.test(ch) ? ch : `Sep${String(ch.codePointAt(0) ?? 0)}`))
    .join("");
  return capitalizeFirst(negative ? `Neg${magnitude}` : magnitude);
}

/**
 * A structural display name for an anonymous (unnamed) `Model` template
 * argument, derived from its own properties' names *and types* instead of
 * the fixed `"Anonymous"` token (review 2026-08-14-120). `{x: string}` →
 * `AnonymousXString`, `{x: string, y: int32}` → `AnonymousXStringYInt32`. The
 * name comes entirely from the argument's own properties (in their own
 * declaration order), never from the position of the field that references
 * it, so the same anonymous-model argument always composes the same key no
 * matter which field of the enclosing model it's declared on or in what
 * order. Each property's type is included, not just its name, so two
 * anonymous models that share property names but differ in property types
 * (e.g. `{x: string}` vs. `{x: int32}`) don't compose the same base name and
 * fall into `findFreeKey`'s order-dependent numeric-suffix ladder (review
 * 2026-08-14-123). A property-less anonymous model (`{}`) falls back to the
 * bare `"Anonymous"` token; any resulting collision is a genuine one, left to
 * `findFreeKey`.
 *
 * Each property's own name is run through `sanitizeLiteralDisplayName` (not
 * `capitalizeFirst`, which passes everything but the first character
 * through verbatim): a backtick-quoted property name can carry arbitrary
 * characters, and inserting one unescaped would leak a character outside
 * the AsyncAPI Components Object key charset into the composed name —
 * the exact leak `sanitizeLiteralDisplayName` already closes for a literal
 * template argument's own text (review 2026-08-14-127).
 *
 * Two syntactically distinct anonymous models with identical property
 * names/types are still two separate `Model` objects and so register two
 * separate (byte-identical) components under `findFreeKey`'s numeric-suffix
 * ladder — not wrong output, just an accepted duplication rather than a
 * dedup this function attempts (review 2026-08-14-128's option (a): treating
 * structural dedup of anonymous instantiations as a possible future
 * refactor, not a defect in this round).
 */
function anonymousModelDisplayName(model: Model): string {
  const names = [...model.properties.values()].map(
    (property) => sanitizeLiteralDisplayName(property.name) + templateArgDisplayName(property.type),
  );
  return "Anonymous" + names.join("");
}

/**
 * A structural display name for an anonymous (unnamed) `Union` template
 * argument, derived from its own variants' display names instead of the
 * fixed `"Union"` token (review 2026-08-14-120). `string | int32` →
 * `UnionStringInt32`. The name comes entirely from the union's own variants
 * (in their own declaration order), never from the position of the field
 * that references it, so the same anonymous-union argument always composes
 * the same key no matter which field of the enclosing model it's declared on
 * or in what order. A variant-less union (impossible in practice) falls back
 * to the bare `"Union"` token; any resulting collision is a genuine one, left
 * to `findFreeKey`.
 */
function anonymousUnionDisplayName(union: Union): string {
  const names = [...union.variants.values()].map((variant) => templateArgDisplayName(variant.type));
  return "Union" + names.join("");
}

/**
 * A short, human-legible name for one template argument, used to build a
 * stable `components.schemas` key for a template instantiation (e.g.
 * `Envelope<Order>` → `EnvelopeOrder`). Only `Type` arguments have a
 * meaningful display name; a genuine `Value` argument (legal wherever the
 * template parameter is constrained to a value rather than a type) has no
 * name of its own worth surfacing, so it falls back to a fixed placeholder —
 * collisions coming from that are handled the same way any other name
 * collision is, by `findFreeKey`'s qualified-name/suffix ladder.
 *
 * A literal or enum member written directly in a template argument list
 * (e.g. `P<"created">`, `P<42>`, `P<Color.Red>`) does **not** arrive here as
 * its own `Type.kind` — `@typespec/compiler` 1.14.0 wraps it in an
 * `IndeterminateEntity` (`entityKind: "Indeterminate"`, no top-level `kind`)
 * since the compiler has not yet decided whether the template parameter is
 * being used as a type or a value. `IndeterminateEntity.type` is always one
 * of `StringLiteral | StringTemplate | NumericLiteral | BooleanLiteral |
 * EnumMember | UnionVariant | NullType` — all real `Type`s with a `kind` — so
 * unwrapping it and recursing here recovers the same meaningful name a
 * directly-typed literal argument gets, instead of collapsing to the
 * "Value" placeholder for the overwhelmingly common case of a literal/enum-
 * member template argument (see plan/review/solved/2026-08-14-106-*.md).
 */
function templateArgDisplayName(arg: Type | Value | IndeterminateEntity): string {
  if ("entityKind" in arg && arg.entityKind === "Indeterminate") {
    return templateArgDisplayName(arg.type);
  }
  if (!("kind" in arg)) {
    return "Value";
  }
  switch (arg.kind) {
    case "Model":
      return arg.name
        ? namespacePrefix(arg.namespace) + templateInstanceName(arg)
        : anonymousModelDisplayName(arg);
    case "Scalar":
      return namespacePrefix(arg.namespace) + capitalizeFirst(arg.name);
    case "Enum":
      return namespacePrefix(arg.namespace) + arg.name;
    case "EnumMember":
      return namespacePrefix(arg.enum.namespace) + arg.enum.name + capitalizeFirst(arg.name);
    case "Union":
      return arg.name !== undefined
        ? namespacePrefix(arg.namespace) + templateInstanceName(arg)
        : anonymousUnionDisplayName(arg);
    case "String":
      return sanitizeLiteralDisplayName(arg.value);
    case "StringTemplate":
      // `stringValue` is set whenever the compiler could reduce the whole
      // template to a plain string at check time (no interpolation, or every
      // interpolated part is itself a literal) — treat it exactly like a
      // `StringLiteral` in that case. Otherwise compose from `spans`: a
      // literal span's own text through the same sanitizer a `StringLiteral`
      // argument gets, an interpolated span recursed into so its own display
      // name (whatever `Type` it turns out to be) contributes, instead of
      // every unreduced string-template argument falling to the shared
      // `Unhandled${arg.kind}` fallback below and colliding with each other
      // (review 2026-08-14-126).
      if (arg.stringValue !== undefined) {
        return sanitizeLiteralDisplayName(arg.stringValue);
      }
      return arg.spans
        .map((span) =>
          span.isInterpolated
            ? templateArgDisplayName(span.type)
            : sanitizeLiteralDisplayName(span.type.value),
        )
        .join("");
    case "Number":
      return sanitizeNumberDisplayName(arg.valueAsString);
    case "Boolean":
      return arg.value ? "True" : "False";
    case "Intrinsic":
      return capitalizeFirst(arg.name);
    case "Tuple":
      return "Tuple" + arg.values.map((value) => templateArgDisplayName(value)).join("");
    default:
      // A fallback token that no handled case can produce (in particular,
      // distinct from `Intrinsic`'s legitimate `"Unknown"` for `unknown`),
      // so an unhandled argument kind never collides with a real type
      // (review 2026-08-14-113).
      return `Unhandled${arg.kind}`;
  }
}

/**
 * Stable `components.schemas` key base for a template instantiation, built
 * from the template's own name plus each type argument's display name (e.g.
 * `Envelope<Order>` → `EnvelopeOrder`, `Page<string>` → `PageString`). This
 * is the long-term naming strategy promised in plan 2.1/2.10, replacing the
 * short-name-collides-so-fall-back-to-qualified-name ladder as the *first*
 * candidate for a template instantiation specifically — every instantiation
 * of the same template already gets its own distinguishable name up front,
 * so the qualified-name/numeric-suffix ladder in `findFreeKey` is only ever
 * reached here for a genuine further collision (e.g. two unrelated
 * templates that happen to produce the same composed name), not for the
 * routine case of "two instantiations of the same template". Returns the
 * plain declaration name unchanged for a non-template (or uninstantiated
 * template declaration, though that path never reaches registration).
 *
 * Shared by `Model` and `Union` — both support templates, and both carry the
 * same `name`/`templateMapper` shape — so a template *union* instantiation
 * (`Wrapper<int32>`) gets the exact same stable-key treatment a template
 * model instantiation does, instead of falling back to the traversal-order-
 * dependent short-name-plus-suffix ladder (see plan/review/solved/
 * 2026-08-14-108-*.md).
 */
function templateInstanceName(type: Model | Union): string {
  const mapper = type.templateMapper;
  if (mapper === undefined || mapper.args.length === 0) {
    return type.name ?? "";
  }
  return (type.name ?? "") + mapper.args.map(templateArgDisplayName).join("");
}

/**
 * TypeSpec intrinsic type (`null`, `never`, `void`, `unknown`, error type)
 * → AsyncAPI schema.
 */
function buildIntrinsicSchema(type: IntrinsicType): SchemaObject {
  switch (type.name) {
    case "null":
      return { type: "null" };
    case "never":
    case "void":
      // No value is valid: nothing matches `{ not: {} }`.
      return { not: {} };
    default:
      // `unknown` (and the error type): any value is valid.
      return {};
  }
}

/**
 * TypeSpec `enum` → AsyncAPI schema. Each member contributes its explicit
 * value (`Red: "R"`) when given, falling back to the member's own name
 * otherwise (`enum Color { Red, Green }` → values `"Red"`, `"Green"`) — the
 * same default TypeSpec itself uses for an unvalued member. `type` is
 * `"number"` only when every member ends up with a numeric value, `"string"`
 * only when every member ends up with a string value; a mix of the two omits
 * `type` entirely (rather than picking one) since `enum` alone already
 * constrains the value and a mismatched `type` would make the members of the
 * other kind unsatisfiable. An empty enum has no member to be, so — like
 * `never`/`void` in `buildIntrinsicSchema` — it returns `{ not: {} }` (nothing
 * is valid) rather than `{}` (anything is valid): `enum: []` would be the
 * literally correct encoding of "no value" but is not a valid draft-07
 * schema, so `{ not: {} }` stands in as the closest valid equivalent.
 */
function buildEnumSchemaBody(type: Enum): SchemaObject {
  if (type.members.size === 0) {
    return { not: {} };
  }
  const values: (string | number)[] = [
    ...new Set([...type.members.values()].map((member) => member.value ?? member.name)),
  ];
  const isNumeric = values.every((value) => typeof value === "number");
  const isString = values.every((value) => typeof value === "string");
  let schemaType: SchemaObject["type"];
  if (isNumeric) {
    schemaType = "number";
  } else if (isString) {
    schemaType = "string";
  }
  return { ...(schemaType !== undefined ? { type: schemaType } : {}), enum: values };
}

/**
 * A single enum member used as a type on its own (`Color.Red`, or as one
 * variant of a union like `Color.Red | Color.Green`) is the same shape as a
 * `string`/`number` literal type: a schema constrained to exactly one value.
 */
function buildEnumMemberSchema(member: EnumMember): SchemaObject {
  const value = member.value ?? member.name;
  return { type: typeof value === "number" ? "number" : "string", enum: [value] };
}

/**
 * True for an uninstantiated template *declaration* (e.g. the `Env` reached
 * by naming it directly in source, as opposed to an instantiation like
 * `Env<string>` or a defaulted use site `Env`). Its properties/variants are
 * bare `TemplateParameter`s with no real shape, so there is nothing
 * meaningful to build — the caller emits the unconstrained schema instead of
 * registering a bogus key. Shared by every named declaration kind that can
 * be a template (model, union).
 */
function isUninstantiatedTemplateDeclaration(type: Model | Union): boolean {
  return (
    type.node !== undefined &&
    "templateParameters" in type.node &&
    type.node.templateParameters.length > 0 &&
    type.templateMapper === undefined
  );
}

/** A `$ref` pointing at `key` inside `components.schemas`. */
function refFor(key: string): ReferenceObject {
  return { $ref: `#/components/schemas/${toJsonPointerToken(key)}` };
}

/**
 * The mime type a schema's own property keys (and, via the compiler's own
 * `serializeObjectValueAsJson`, an `@example`'s object keys) are resolved
 * against through `@encodedName`. Hardcoded because 2.7 has no notion yet of
 * a message's actual wire `contentType` — a model with e.g. both
 * `@encodedName("application/json", ...)` and
 * `@encodedName("application/xml", ...)` always emits the JSON name
 * regardless of which content type a message actually declares. Phase 3
 * (per-message content types) must thread the real `contentType` through to
 * both this constant's use site and the example serialization it keeps in
 * sync with, rather than assuming JSON everywhere.
 */
const SCHEMA_ENCODING_MIME_TYPE = "application/json";

/**
 * A defined (non-`undefined`) `encodeAs` whose `encoding` matches none of the
 * compiler's known encodings (`unixTimestamp`/`rfc7231` for date-times,
 * `seconds` for durations — see `ScalarSerializers` in
 * `@typespec/compiler`'s `lib/examples.js`), so every serializer falls
 * through to its un-encoded, "no `@encode` applied" representation. `type`
 * is only read back out of this value on the `duration` + `seconds` branch,
 * which this `encoding` never reaches, so any scalar can stand in for it.
 */
function neutralEncodeAs(type: Scalar): EncodeData {
  return { encoding: "rfc3339", type };
}

/**
 * `serializeValueAsJson`'s handlers hook, used below for two purposes: (1)
 * turning a scalar it cannot represent (`resolveKnownScalar` returning
 * `undefined` for an unsupported/custom scalar constructor) into a thrown
 * `UnserializableValueError` instead of a silent `undefined` return —
 * without this, an unrepresentable scalar nested inside an array or object
 * value would leave a stray `undefined` buried in the result, invisible to a
 * top-level `undefined` check; and (2) making sure no `@encode` — whether
 * declared on the scalar itself, on a property of the immediate type, or on
 * a property nested arbitrarily deep inside a model/array value — is ever
 * applied while serializing an example. 2.7's `buildScalarSchema` does not
 * map `@encode` into a schema's `type`/`format` (that is plan 2.8's scope),
 * so an example that *did* apply `@encode` would encode a value the schema
 * itself does not declare and fail validation against its own schema.
 *
 * The compiler binds `originalFn` to the exact `encodeAs` this call
 * received, so re-invoking it with a different `encodeAs` argument has no
 * effect (the extra argument is silently ignored) — and `resolveKnownScalar`
 * unconditionally re-reads the scalar's own `@encode` internally regardless
 * of what is passed in. So skipping `@encode` here instead re-enters the
 * compiler's *exported* `serializeValueAsJson` (not the bound `originalFn`)
 * with a defined, neutral `encodeAs` (see `neutralEncodeAs`): since
 * `encodeAs ?? result.encodeAs` favors an already-defined `encodeAs`, this
 * neutral value wins over any `@encode` `resolveKnownScalar` would otherwise
 * pick up, without needing to know all the ways `@encode` could reach this
 * value.
 */
function makeSerializeHandlers(program: Program): Parameters<typeof serializeValueAsJson>[4] {
  return {
    serializeScalarValue: (value, type) => {
      const result = serializeValueAsJson(program, value, type, neutralEncodeAs(value.scalar));
      if (result === undefined) {
        throw new UnserializableValueError(
          `Cannot serialize scalar '${value.scalar.name}' as JSON.`,
        );
      }
      return result;
    },
  };
}

/**
 * Recovers source order for `getExamples`' result. `getExamples` returns
 * decorators in the order they were *applied*, not necessarily the order
 * they appear in source: inline `@example` decorators execute bottom-up
 * (last-listed executes first), while `@@example` augment decorators are
 * spliced in *before* the inline ones by the checker (see `checkDecorators`
 * in `@typespec/compiler`'s `checker.js`) — so a blanket reverse (correct
 * for inline-only decorators) inverts the relative order of augment
 * decorators instead. `target.decorators` is public, in the same execution
 * order `getExamples`' raw result is in, and pairs up 1:1 with it — so
 * filtering it down to the `@example` applications and sorting by each
 * one's source position recovers true source order for both inline and
 * augment decorators, and any mix of the two.
 *
 * A decorator's `node.pos` is only a byte offset *within its own source
 * file* — comparing `pos` across two different `.tsp` files compares
 * unrelated numbers, so when a type's `@example`s are spread across files
 * the sort key must rank by file first. `program.sourceFiles` is a `Map`
 * whose insertion order matches the order files were reached while
 * compiling (`main.tsp` first, each `import` the first time it is reached),
 * so indexing into it gives a stable, execution-order-consistent file
 * ranking; `pos` remains the tie-break for two examples in the same file.
 */
function orderExamplesBySource(
  program: Program,
  target: Model | Scalar | Enum | Union | ModelProperty | UnionVariant,
  rawExamples: readonly Example[],
): Example[] {
  const exampleNodes = target.decorators.filter((d) => d.decorator === $example).map((d) => d.node);
  if (exampleNodes.length !== rawExamples.length) {
    // Should not happen (every applied `@example` has a source node), but
    // fall back to the previous best-effort behavior rather than throw.
    return [...rawExamples].reverse();
  }
  const fileOrder = new Map<string, number>();
  for (const path of program.sourceFiles.keys()) {
    fileOrder.set(path, fileOrder.size);
  }
  const keys: { fileIndex: number; pos: number }[] = [];
  for (const node of exampleNodes) {
    if (node === undefined) {
      // Should not happen (every applied `@example` has a source node), but
      // fall back to the previous best-effort behavior rather than throw.
      return [...rawExamples].reverse();
    }
    const location = getSourceLocation(node);
    keys.push({ fileIndex: fileOrder.get(location.file.path) ?? -1, pos: node.pos });
  }
  return rawExamples
    .map((example, i) => ({ example, ...keys[i] }))
    .sort((a, b) => a.fileIndex - b.fileIndex || a.pos - b.pos)
    .map((entry) => entry.example);
}

/**
 * `title`/`description`/`examples` contributed by a declaration's own
 * documentation decorators: `@summary` → `title`, `@doc` (or a plain doc
 * comment, which `getDoc` already resolves to the same thing) →
 * `description`, and TypeSpec's built-in `@example` → `examples` (each
 * example value serialized to plain JSON against `exampleValueType`, in
 * source order — see `orderExamplesBySource`). A value `serializeValueAsJson`
 * cannot represent (an unsupported scalar constructor, anywhere in the
 * value — including nested inside an array or object — or a function value)
 * causes that whole example to be dropped rather than left to throw past
 * this builder or to leak in as a JSON `null`/a silently-missing key —
 * either way the example carries no usable information. A dropped example
 * still reports the `unserializable-example` warning diagnostic (targeting
 * the declaration/property the `@example` was applied to) so the drop is not
 * completely silent, even though the emitted schema itself has no field to
 * say so. Omits any field whose decorator was not applied, per the emitter's
 * omit-empty convention.
 *
 * Note: `ExampleOptions`'s `title`/`description` (the `@example`'s second
 * argument) are deliberately not read here. draft-07's `examples` keyword is
 * a bare array of values with nowhere to hang a per-entry title/description,
 * so this phase has no field to put them in; Phase 3 (message-level
 * examples, which have their own `name`/`summary` fields) is where they get
 * picked up.
 */
function buildDocFields(
  program: Program,
  target: Model | Scalar | Enum | Union | ModelProperty | UnionVariant,
  exampleValueType: Type,
): Pick<SchemaObject, "title" | "description" | "examples"> {
  const title = getSummary(program, target);
  const description = getDoc(program, target);
  const handlers = makeSerializeHandlers(program);
  // `@example`'s own `extern dec` declaration legally targets `UnionVariant`
  // (see `decorators.tsp`), but `getExamples`'s exported TS signature omits
  // it — a typing gap in `@typespec/compiler` itself, not a real runtime
  // restriction (its state is stored generically over `Type`). The cast
  // below only widens the static type to match what the decorator already
  // allows.
  const rawExamples = getExamples(program, target as Model | Scalar | Enum | Union | ModelProperty);
  const examples = orderExamplesBySource(program, target, rawExamples)
    .map((example) => {
      try {
        return serializeValueAsJson(program, example.value, exampleValueType, undefined, handlers);
      } catch {
        // An example that carries no usable information (unserializable
        // scalar per `UnserializableValueError`, or any other failure —
        // e.g. the compiler's own duration serializer throws a plain
        // `RangeError` from `Temporal.Duration.from` on a malformed
        // `duration.fromISO(...)` value that the compiler never validates)
        // is dropped rather than left to crash the whole emit. Still surface
        // it as a diagnostic rather than dropping it in total silence.
        reportDiagnostic(program, { code: "unserializable-example", target });
        return undefined;
      }
    })
    .filter((value) => value !== undefined);
  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  };
}

/**
 * Resolves one `@minValue`/`@maxValue`/`@minValueExclusive`/
 * `@maxValueExclusive` bound to the JSON-number `minimum`/`maximum`/
 * `exclusiveMinimum`/`exclusiveMaximum` field it maps to. The compiler's own
 * `get*Value*` accessors (`getMinValue`, etc.) silently return `undefined`
 * both when the decorator was never applied *and* when it was applied but
 * the stored value cannot be represented as a JS `number` — either because
 * it overflows (e.g. `@maxValue(9223372036854775807) v: int64;`) or loses
 * precision (e.g. a `decimal128` bound with more significant digits than a
 * JS `number` carries) — per that accessor's own doc comment. Reading the
 * raw `Numeric` first (`get*ValueAsNumeric`) distinguishes the two: a
 * defined `Numeric` whose `asNumber()` is `null` means the decorator *was*
 * applied but cannot be emitted, which is reported as a diagnostic instead
 * of vanishing without a word.
 *
 * Separately, `@minValue`/`@maxValue` also legally target a temporal scalar
 * (`utcDateTime`, `plainDate`, `duration`, ...), in which case the compiler
 * stores a `ScalarValue` rather than a `Numeric` and the numeric accessor
 * above returns `undefined` by construction — read back here via the
 * `get*ValueForScalar` sibling accessor so that case is diagnosed too,
 * rather than silently indistinguishable from "decorator absent". draft-07
 * has no keyword to express a bound on a `string`-typed (`format: date-time`
 * etc.) schema, so this case can only ever be diagnosed, never emitted.
 */
function resolveRangeBound(
  program: Program,
  target: Type,
  reported: Map<Type, Set<string>>,
  decorator: string,
  numeric: ReturnType<typeof getMinValueAsNumeric>,
  scalarValue: ReturnType<typeof getMinValueForScalar>,
): number | undefined {
  if (numeric !== undefined) {
    const asNumber = numeric.asNumber();
    if (asNumber === null) {
      reportRangeDiagnosticOnce(
        program,
        reported,
        "unrepresentable-numeric-constraint",
        target,
        decorator,
      );
      return undefined;
    }
    return asNumber;
  }
  if (scalarValue !== undefined) {
    reportRangeDiagnosticOnce(
      program,
      reported,
      "unsupported-temporal-range-constraint",
      target,
      decorator,
    );
  }
  return undefined;
}

/**
 * Resolves one `@minLength`/`@maxLength`/`@minItems`/`@maxItems` bound to the
 * JSON-number `minLength`/`maxLength`/`minItems`/`maxItems` field it maps to.
 * These decorators' own `get*` accessors have the exact same silent-collapse
 * problem `resolveRangeBound`'s doc comment describes for
 * `@minValue`/`@maxValue`: their signature is `value: valueof integer`
 * (arbitrary precision), and the plain accessor
 * (`get*AsNumeric(...)?.asNumber() ?? undefined`) cannot distinguish
 * "decorator absent" from "decorator applied but the value overflows a JS
 * `number`" — both simply come back `undefined`. Reading the raw `Numeric`
 * first and checking `asNumber()` for `null` recovers that distinction, same
 * as `resolveRangeBound` does. Unlike `@minValue`/`@maxValue`, none of these
 * four decorators may legally target a temporal scalar, so there is no
 * `ScalarValue` sibling case to check here.
 */
function resolveLengthBound(
  program: Program,
  target: Type,
  reported: Map<Type, Set<string>>,
  decorator: string,
  numeric: ReturnType<typeof getMinLengthAsNumeric>,
): number | undefined {
  if (numeric === undefined) {
    return undefined;
  }
  const asNumber = numeric.asNumber();
  if (asNumber === null) {
    reportRangeDiagnosticOnce(
      program,
      reported,
      "unrepresentable-numeric-constraint",
      target,
      decorator,
    );
    return undefined;
  }
  return asNumber;
}

/**
 * Reports a range-constraint diagnostic at most once per (`target`,
 * `decorator`, `SchemaBuilder` instance) triple. Named models/enums/unions
 * are only ever built once thanks to `registerNamed`'s cache, so any
 * diagnostic `buildValidationKeywords` reports for them is naturally
 * reported once too — but a scalar has no such cache
 * (`buildScalarSchemaShapeWithDocs` re-walks the whole `baseScalar` chain at
 * every use site), so without this guard the same offending decorator would
 * be re-reported once per property that uses the scalar. `reported` is
 * threaded down from a `SchemaBuilder` instance's own `Map` (see
 * `SchemaBuilder.diagnosedTargets`) so this dedup is scoped to one
 * builder/one emit, not shared globally. Keying on `decorator` too (not just
 * `target`/`code`) matters because one diagnostic code covers several
 * distinct decorators (e.g. both `@minLength` and `@maxLength` map to
 * `unrepresentable-numeric-constraint`) — a target with two independently
 * overflowing constraints must still get one diagnostic per constraint, not
 * have the second silently swallowed by the first's dedup entry.
 */
function reportRangeDiagnosticOnce(
  program: Program,
  reported: Map<Type, Set<string>>,
  code: "unrepresentable-numeric-constraint" | "unsupported-temporal-range-constraint",
  target: Type,
  decorator: string,
): void {
  let keys = reported.get(target);
  if (keys === undefined) {
    keys = new Set();
    reported.set(target, keys);
  }
  const key = `${code}:${decorator}`;
  if (keys.has(key)) {
    return;
  }
  keys.add(key);
  reportDiagnostic(program, { code, target, format: { decorator } });
}

/**
 * `minLength`/`maxLength`/`pattern`/`format` (string), `minimum`/`maximum`/
 * `exclusiveMinimum`/`exclusiveMaximum` (numeric — draft-07's numeric-value
 * form, not the draft-06+ boolean-flag form; see `resolveRangeBound` for how
 * an unrepresentable or temporal bound is diagnosed rather than silently
 * dropped), and `minItems`/`maxItems` (array) contributed by
 * `@typespec/compiler`'s own built-in validation decorators (2.8). Each of
 * these decorators legally targets either a scalar/model declaration
 * directly (`@minLength(2) scalar Username extends string;`) or a
 * `ModelProperty` (`@minLength(2) name: string;`) — the compiler's own
 * `get*` accessors read state keyed by whichever `Type` the decorator was
 * actually applied to, so passing either kind of target here just works. A
 * decorator that does not apply to `target`'s own kind (e.g. `@minLength`
 * can never legally reach a numeric scalar — the checker itself rejects
 * that at compile time) simply reads back `undefined` here, so all
 * accessors can be called unconditionally without first switching on what
 * shape `target` is. Omits every field whose decorator was not applied, per
 * the emitter's omit-empty convention.
 *
 * There is no `@uniqueItems` (or equivalent) decorator in `@typespec/compiler`
 * 1.14.0's standard library — only `@minItems`/`@maxItems` exist for arrays —
 * so `uniqueItems` is not produced here; it has no source decorator to read.
 */
function buildValidationKeywords(
  program: Program,
  target: Type,
  reported: Map<Type, Set<string>>,
): Partial<SchemaObject> {
  const minLength = resolveLengthBound(
    program,
    target,
    reported,
    "minLength",
    getMinLengthAsNumeric(program, target),
  );
  const maxLength = resolveLengthBound(
    program,
    target,
    reported,
    "maxLength",
    getMaxLengthAsNumeric(program, target),
  );
  const pattern = getPattern(program, target);
  const format = getFormat(program, target);
  const minimum = resolveRangeBound(
    program,
    target,
    reported,
    "minValue",
    getMinValueAsNumeric(program, target),
    getMinValueForScalar(program, target),
  );
  const maximum = resolveRangeBound(
    program,
    target,
    reported,
    "maxValue",
    getMaxValueAsNumeric(program, target),
    getMaxValueForScalar(program, target),
  );
  const exclusiveMinimum = resolveRangeBound(
    program,
    target,
    reported,
    "minValueExclusive",
    getMinValueExclusiveAsNumeric(program, target),
    getMinValueExclusiveForScalar(program, target),
  );
  const exclusiveMaximum = resolveRangeBound(
    program,
    target,
    reported,
    "maxValueExclusive",
    getMaxValueExclusiveAsNumeric(program, target),
    getMaxValueExclusiveForScalar(program, target),
  );
  const minItems = resolveLengthBound(
    program,
    target,
    reported,
    "minItems",
    getMinItemsAsNumeric(program, target),
  );
  const maxItems = resolveLengthBound(
    program,
    target,
    reported,
    "maxItems",
    getMaxItemsAsNumeric(program, target),
  );
  return {
    ...(minLength !== undefined ? { minLength } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(pattern !== undefined ? { pattern } : {}),
    ...(format !== undefined ? { format } : {}),
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    ...(exclusiveMinimum !== undefined ? { exclusiveMinimum } : {}),
    ...(exclusiveMaximum !== undefined ? { exclusiveMaximum } : {}),
    ...(minItems !== undefined ? { minItems } : {}),
    ...(maxItems !== undefined ? { maxItems } : {}),
  };
}

/**
 * Merges a declaration's own documentation fields and its own validation
 * keywords (2.8) onto its (always plain, never-a-`$ref`) schema body — used
 * for the model/enum/union/scalar bodies built inside `registerNamed` and
 * `buildScalarSchemaShapeWithDocs`, which are never a bare `$ref` to
 * themselves. Enum/union are never a legal target of any 2.8 validation
 * decorator, so merging `buildValidationKeywords` in for them is a no-op —
 * kept unconditional anyway so every named-declaration kind shares this one
 * function instead of splitting into a docs-only and a docs+validation
 * variant.
 */
function withDocs(
  program: Program,
  target: Model | Scalar | Enum | Union,
  schema: SchemaObject,
  reported: Map<Type, Set<string>>,
): SchemaObject {
  const docs = buildDocFields(program, target, target);
  const validation = buildValidationKeywords(program, target, reported);
  // `format` is a draft-07 *annotation* (and an assertion under a
  // format-assertion vocabulary), not an intersectable assertion keyword
  // like `minLength`/`pattern`/`minimum`: two different `format`s on the
  // same value are a contradiction, not a valid `allOf` intersection. So
  // `format` is excluded from the collision set below and always merged
  // last (this level's `format`, if any, wins over the base's).
  const { format, ...restValidation } = validation;
  // A derived scalar re-declaring a validation keyword its base scalar
  // already baked into `schema` (see `buildScalarSchemaShapeWithDocs`) must
  // not have it silently replaced by plain object-spread — two constraints
  // on the same value are a JSON Schema intersection (both must hold). On
  // collision, wrap `schema` whole in `allOf` (same wrap `withPropertyDocs`
  // uses for the property-vs-scalar case) so this level's keywords are
  // layered as siblings instead of merged into the same object. Model/
  // enum/union targets never hit this branch in practice since `schema` for
  // them is a freshly-built body with no validation keywords already baked
  // in to collide with.
  const collidesWithBase = Object.keys(restValidation).some(
    (key) => key in (schema as Record<string, unknown>),
  );
  if (collidesWithBase) {
    // `title`/`description`/`examples` are annotations: left inside the
    // `allOf` branch they would not propagate to the parent schema, so any
    // reader looking at this level's own `title`/`description` would see
    // nothing whenever an unrelated validation keyword happens to collide.
    // Strip them from the wrapped copy and re-emit at the outer level. This
    // level's own `docs` wins when present; when this level has no own
    // annotation for a given field, the base's value (still sitting on
    // `schema` before stripping) must be carried up instead of silently
    // dropped — a derived scalar that only adds a validation keyword, with
    // no `@doc` of its own, must not lose the base's inherited description.
    const inner: SchemaObject = { ...schema };
    const title = docs.title ?? inner.title;
    const description = docs.description ?? inner.description;
    const examples = docs.examples ?? inner.examples;
    delete inner.title;
    delete inner.description;
    delete inner.examples;
    return {
      allOf: [inner],
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(examples !== undefined ? { examples } : {}),
      ...restValidation,
      ...(format !== undefined ? { format } : {}),
    };
  }
  return {
    ...schema,
    ...docs,
    ...validation,
  };
}

/**
 * Merges a property's (or union variant's) own documentation fields onto its
 * schema entry. A property typed as a named declaration builds to a bare
 * `$ref` (see `buildSchema`), which per JSON Schema has no sibling keywords
 * of its own — so a ref is wrapped in `allOf` to give the property's
 * `title`/`description`/`examples` somewhere valid to live, while a plain
 * inline schema gets them merged in directly. `prop.type` (not `prop` itself)
 * is passed as the example's value type: passing `prop` would make
 * `serializeValueAsJson` apply the property's own `@encode` to the example,
 * but 2.7's `buildScalarSchema` does not yet map `@encode` into the schema's
 * `type`/`format` (that is plan 2.8's scope) — encoding only the example and
 * not the schema would produce an example that fails validation against its
 * own property's schema. Shared with `buildUnionSchemaBody` for a union
 * variant's own `@doc`/`@summary`/`@example` (`UnionVariant` has the same
 * `type` shape a `ModelProperty` does, and is a legal `@example` target per
 * `decorators.tsp`).
 *
 * Also merges the property's (or variant's) own 2.8 validation keywords
 * (`buildValidationKeywords`) the same way: a `@minLength`/`@minValue`/
 * `@minItems`/etc. applied directly at the property use site (rather than on
 * the underlying scalar/model declaration) needs the exact same $ref-wrap-or-
 * merge handling documentation already gets, since both are "extra keywords
 * this use site contributes on top of its type's own schema". Unlike
 * `title`/`description`, a validation keyword that collides with one already
 * baked into `schema` (`buildScalarSchemaShapeWithDocs` bakes in every 2.8
 * keyword, not just `type`/`format`) must NOT simply replace it: two
 * constraints declared on the same value are a JSON Schema intersection
 * (both must hold), never a replacement — a property weakening a scalar's
 * own `@minLength`/`@pattern`/etc. must not silently erase the scalar's
 * (stricter) constraint. On collision, `schema` is wrapped whole in `allOf`
 * (same wrap the `$ref` branch already uses) and the property's own
 * keywords are layered as sibling keywords instead of merged into the same
 * object — JSON Schema requires an `allOf` branch's keywords and any sibling
 * keywords to all hold simultaneously, so this preserves both constraints
 * without needing a per-keyword intersection rule (numeric min/max, regex
 * `pattern`, etc. all fall out of the same wrap). When there is no
 * collision, the keywords are still merged in directly as before.
 */
function withPropertyDocs(
  program: Program,
  prop: ModelProperty | UnionVariant,
  schema: SchemaObject | ReferenceObject,
  reported: Map<Type, Set<string>>,
): SchemaObject | ReferenceObject {
  const docs = buildDocFields(program, prop, prop.type);
  const validation = buildValidationKeywords(program, prop, reported);
  const extra = { ...docs, ...validation };
  if (Object.keys(extra).length === 0) {
    return schema;
  }
  if ("$ref" in schema) {
    return { allOf: [schema], ...extra };
  }
  // `format` is a draft-07 *annotation*, not an intersectable assertion
  // keyword — two different `format`s on the same value are a contradiction,
  // not a valid `allOf` intersection, so it must never by itself trigger the
  // collision branch below (same reasoning as `withDocs`). Excluded from the
  // collision set and merged in last so this level's `format`, if any, wins.
  const { format, ...restValidation } = validation;
  const collidesWithOwnShape = Object.keys(restValidation).some(
    (key) => key in (schema as Record<string, unknown>),
  );
  if (collidesWithOwnShape) {
    // Same annotation-hoisting rule as `withDocs`: `title`/`description`/
    // `examples` left inside the `allOf` branch would not propagate to the
    // parent schema. This level's own value wins when present; otherwise the
    // scalar's inherited value (still on `schema` before stripping) is
    // carried up instead of being silently dropped — a property that only
    // adds a colliding validation keyword, with no `@doc` of its own, must
    // not lose the scalar's inherited description.
    const inner: SchemaObject = { ...schema };
    const title = docs.title ?? inner.title;
    const description = docs.description ?? inner.description;
    const examples = docs.examples ?? inner.examples;
    delete inner.title;
    delete inner.description;
    delete inner.examples;
    return {
      allOf: [inner],
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(examples !== undefined ? { examples } : {}),
      ...restValidation,
      ...(format !== undefined ? { format } : {}),
    };
  }
  // The property has its own title and/or description: it fully determines
  // this use site's title/description, replacing (not merging with)
  // whatever the scalar's own schema shape may have baked in via
  // `buildScalarSchema` — otherwise a property overriding only e.g.
  // `@summary` would incoherently keep the underlying scalar's `@doc` as its
  // `description`. `examples` does not affect either field, so a property
  // that only adds its own `@example` must not strip the scalar's inherited
  // `title`/`description` — only gate the deletion on the fields actually
  // being overridden.
  const rest: SchemaObject = { ...schema };
  if (docs.title !== undefined || docs.description !== undefined) {
    delete rest.title;
    delete rest.description;
  }
  return { ...rest, ...extra };
}

/**
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 */
export class SchemaBuilder {
  public constructor(private readonly program: Program) {}

  private readonly schemas: Record<string, SchemaObject> = Object.create(null) as Record<
    string,
    SchemaObject
  >;

  public getSchemas(): Record<string, SchemaObject> {
    return this.schemas;
  }

  public buildSchema(type: Type): SchemaObject | ReferenceObject {
    switch (type.kind) {
      case "Model":
        return this.buildModelSchema(type);
      case "Scalar":
        return this.buildScalarSchema(type);
      case "Intrinsic":
        return buildIntrinsicSchema(type);
      case "Enum":
        return this.buildEnumSchema(type);
      case "EnumMember":
        return buildEnumMemberSchema(type);
      case "Union":
        return this.buildUnionSchema(type);
      case "String":
        // `enum` is used uniformly for both literals and real enums so 2.6
        // has one code path to maintain; `const` would be equivalent here
        // but would need its own branch.
        return { type: "string", enum: [type.value] };
      case "Number":
        return { type: "number", enum: [type.value] };
      case "Boolean":
        return { type: "boolean", enum: [type.value] };
      default:
        return {};
    }
  }

  // Keyed by the type itself (model, enum, or named union) rather than a
  // narrower type so every kind of named declaration shares one registry —
  // and, with it, one circular-reference guard.
  private readonly building = new Set<Type>();
  private readonly schemaKeys = new Map<Type, string>();
  private readonly usedKeys = new Set<string>();

  // Dedupes range/length-constraint diagnostics per (target, diagnostic
  // code) so a scalar re-walked at every use site (see
  // `buildScalarSchemaShapeWithDocs`, which has no per-type cache the way
  // `registerNamed` gives models/enums/unions) is not re-diagnosed once per
  // property that uses it.
  private readonly diagnosedTargets = new Map<Type, Set<string>>();

  /**
   * Returns the `components.schemas` key for a named declaration (model,
   * enum, or named union), registering it on first use. Uses the bare name
   * unless another declaration already claimed it, in which case the
   * dot-separated fully qualified name (e.g. `Foo.Bar.Model`) is used.
   * The qualified name is not guaranteed unique either — a global-namespace
   * declaration's qualified name equals its bare name, and every
   * instantiation of one template shares both — so taken candidates fall
   * through to the qualified name with a numeric suffix (e.g. `Foo.Bar.Model_2`).
   */
  private getSchemaKey(type: Type, name: string, namespace: Namespace | undefined): string {
    const cached = this.schemaKeys.get(type);
    if (cached !== undefined) {
      return cached;
    }
    const key = this.findFreeKey(name, namespace);
    this.schemaKeys.set(type, key);
    this.usedKeys.add(key);
    return key;
  }

  private findFreeKey(name: string, namespace: Namespace | undefined): string {
    if (!this.usedKeys.has(name)) {
      return name;
    }
    const qualified = getQualifiedName(name, namespace);
    if (!this.usedKeys.has(qualified)) {
      return qualified;
    }
    for (let n = 2; ; n++) {
      const candidate = `${qualified}_${String(n)}`;
      if (!this.usedKeys.has(candidate)) {
        return candidate;
      }
    }
  }

  private buildModelSchema(model: Model): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(model)) {
      return {};
    }

    const build = () => {
      // A model can have an `indexer` (making `buildCollectionSchema` return
      // a shape) via `is Record<T>`/`is Array<T>`, but also via a spread of
      // an indexed model (the compiler's `spreadIndexers` handling sets the
      // same `indexer`) — either way, `model` can *also* declare its own
      // properties (`model Bag { id: string; ...Record<string>; }`) and/or
      // `extends` a base. An array-backed model can never have properties of
      // its own (`no-array-properties` forbids it), so its collection shape
      // *is* `own` outright; a record-backed model's `additionalProperties`
      // constraint and its own declared properties are two independent,
      // mergeable facts about the same object, so both are combined into one
      // `own` shape. `applyExtends` is then always run — passing `own`
      // through unchanged when `model.baseModel` is `undefined` — instead of
      // being skipped whenever `model` itself happens to be collection-backed:
      // skipping it silently dropped both the model's own properties (the
      // `Bag` case above) and any inherited shape from `extends` whenever a
      // spread indexer was also present.
      const collection = this.buildCollectionSchema(model);
      let own: SchemaObject;
      if (collection === undefined) {
        own = this.buildObjectSchema(model);
      } else if (isArrayModelType(model)) {
        own = collection;
      } else {
        own = { ...collection, ...this.buildObjectSchema(model) };
      }
      const shape = this.applyExtends(model, own);
      // `@discriminator` is applied here — on the fully-assembled shape,
      // *after* `applyExtends` has already wrapped it in `allOf` when
      // `model` has a `baseModel` — rather than inside `buildObjectSchema`
      // (which only ever sees the own, pre-`allOf` shape). AsyncAPI 3.x's
      // Schema Object reads `discriminator` off the schema object itself; a
      // model that both has a `baseModel` and its own `@discriminator` (a
      // 3-level hierarchy, or a discriminated sub-hierarchy) would otherwise
      // have `discriminator` buried inside `allOf`'s second branch, where no
      // consumer looks for it. Called unconditionally, including for a
      // collection-backed model (`collection !== undefined`): the compiler's
      // `extern dec discriminator(target: Model, ...)` legally accepts any
      // Model, including one backed by `Array`/`Record`, so a user *can*
      // write `@discriminator` there even though it can never resolve to a
      // real property. `applyDiscriminator`'s own `findDiscriminatingProperty`
      // walk already finds nothing in that case (a collection-backed model
      // has no object property matching the discriminator's name), so this
      // reports `missing-discriminator-property` and omits `discriminator`
      // rather than silently dropping the decorator with no diagnostic at
      // all.
      return withDocs(
        this.program,
        model,
        this.applyDiscriminator(model, shape),
        this.diagnosedTargets,
      );
    };

    // The anonymous use site (`string[]`, `Record<int32>`) has no name of
    // its own worth registering — it always inlines. A *named* array/record
    // alias (`model Names is string[];`) is a real declaration and must go
    // through the same register-and-$ref path as any other named model
    // instead, so only the anonymous case returns early here.
    if (isBuiltinCollectionInstantiation(model)) {
      const collection = this.buildCollectionSchema(model);
      if (collection !== undefined) {
        return collection;
      }
    }

    if (!model.name) {
      return build();
    }
    return this.registerNamed(model, templateInstanceName(model), model.namespace, build);
  }

  /**
   * Registers `type` under a fresh `components.schemas` key on first use
   * (computing its schema body via `build`) and returns a `$ref` to it;
   * repeat calls for the same type — including a call reached while `build`
   * for it is still running, i.e. a circular reference — return the same
   * `$ref` without recomputing. Shared by every named declaration kind
   * (model, enum, named union) so the register/$ref/circular-guard dance
   * lives in exactly one place.
   */
  private registerNamed(
    type: Type,
    name: string,
    namespace: Namespace | undefined,
    build: () => SchemaObject,
  ): ReferenceObject {
    const key = this.getSchemaKey(type, name, namespace);
    if (Object.hasOwn(this.schemas, key) || this.building.has(type)) {
      return refFor(key);
    }
    this.building.add(type);
    try {
      this.schemas[key] = build();
    } catch (error) {
      // `build()` failed: release the key this type claimed so it is not
      // left registered under `schemaKeys`/`usedKeys` with no corresponding
      // entry in `this.schemas` — otherwise a retry (or another reference to
      // the same type) would see `this.building` no longer containing it and
      // `this.schemas` still missing the key, and return a `$ref` pointing at
      // a component that will never exist.
      this.schemaKeys.delete(type);
      this.usedKeys.delete(key);
      throw error;
    } finally {
      this.building.delete(type);
    }
    return refFor(key);
  }

  private buildEnumSchema(type: Enum): ReferenceObject {
    return this.registerNamed(type, type.name, type.namespace, () =>
      withDocs(this.program, type, buildEnumSchemaBody(type), this.diagnosedTargets),
    );
  }

  private buildUnionSchema(type: Union): SchemaObject | ReferenceObject {
    if (isUninstantiatedTemplateDeclaration(type)) {
      return {};
    }
    const build = () =>
      withDocs(this.program, type, this.buildUnionSchemaBody(type), this.diagnosedTargets);
    if (type.name === undefined) {
      return build();
    }
    return this.registerNamed(type, templateInstanceName(type), type.namespace, build);
  }

  /**
   * A union of only string literals (`"a" | "b"`) collapses to the same
   * `{ type: "string", enum: [...] }` shape a `string`-valued enum gets —
   * one code path for "a closed set of string values", same as `buildSchema`
   * already does for a lone string literal. Any other union (including
   * `T | null`) falls through to `anyOf`, one member per variant; JSON
   * Schema (unlike OpenAPI 3.0's `nullable`) has no separate nullability
   * keyword, so `T | null` becomes `anyOf: [T, { type: "null" }]`. An empty
   * union has no variant to be, so — like `never`/`void` in
   * `buildIntrinsicSchema` — it returns `{ not: {} }` (nothing is valid)
   * rather than `{}` (anything is valid): `anyOf: []` would be the literally
   * correct encoding of "no variant" but is not a valid draft-07 schema.
   *
   * Each `anyOf` branch is passed through `withPropertyDocs` so a variant's
   * own `@doc`/`@summary`/`@example` (legal directly on a `UnionVariant`, see
   * `decorators.tsp`) is not silently dropped — same merge/`allOf`-wrap
   * behavior a model property's documentation already gets. The
   * string-literal-collapsing branch above stays untouched: it already
   * discards individual variants in favor of one shared `enum`, so there is
   * no single variant left to hang per-branch documentation off of.
   */
  private buildUnionSchemaBody(type: Union): SchemaObject {
    const variants = [...type.variants.values()];
    if (variants.length === 0) {
      return { not: {} };
    }
    if (variants.every((variant) => variant.type.kind === "String")) {
      return {
        type: "string",
        enum: [...new Set(variants.map((variant) => (variant.type as StringLiteral).value))],
      };
    }
    return {
      anyOf: variants.map((variant) =>
        withPropertyDocs(
          this.program,
          variant,
          this.buildSchema(variant.type),
          this.diagnosedTargets,
        ),
      ),
    };
  }

  /**
   * Builds the `array`/`object` shape for a model backed by the built-in
   * `Array`/`Record` template (`string[]`, `Record<int32>`, or a named alias
   * declared with `is`), or `undefined` when `model` is neither. Shared by
   * both the anonymous-use-site early return and the named-alias path so the
   * two can never drift apart.
   */
  private buildCollectionSchema(model: Model): SchemaObject | undefined {
    if (isArrayModelType(model)) {
      return { type: "array", items: this.buildSchema(model.indexer.value) };
    }
    if (isRecordModelType(model)) {
      return { type: "object", additionalProperties: this.buildSchema(model.indexer.value) };
    }
    return undefined;
  }

  /**
   * `model B extends A` → `{ allOf: [{ $ref: A }, own] }`, registering `A`
   * into `components.schemas` (via the recursive `buildSchema` call, same as
   * any other named-model reference) if it is not registered already. `own`
   * is `B`'s own shape built from only its own declared properties —
   * `model.properties` already excludes inherited members (they live on
   * `baseModel`, walked separately here), so there is no risk of double-
   * counting a property both in `own` and via the base's `$ref`. A model
   * with no `baseModel` (the common case) returns `own` unchanged: wrapping
   * every model in a single-element `allOf` would be needlessly noisy.
   *
   * When `own` contributes nothing beyond the bare `{ type: "object" }`
   * shape (the derived model declares no properties of its own — a common
   * pattern for a `@discriminator` sub-type that only narrows a literal),
   * the second `allOf` branch is dropped too: an empty `{ type: "object" }`
   * sibling adds no constraint, so it is pure noise against the same
   * omit-empty convention `buildObjectSchema` already follows for
   * `properties`/`required`.
   *
   * When `model.baseModel` is itself array/record-backed (a `Model
   * extends Array<T>`/`Record<T>`, built-in or a named `is` alias) *and*
   * `own` contributes nothing beyond the empty `{ type: "object" }` shape,
   * `own` is dropped entirely rather than paired with the base's actual
   * `array`/`object`-with-`additionalProperties` shape — an `own` that is
   * always the bare `{type:"object"}` sibling would otherwise sit next to a
   * `type:"array"` branch under `allOf`'s implicit AND, making the schema
   * unsatisfiable by any value. For an *anonymous* base (`Array<T>`/
   * `Record<T>` at the use site) the base's collection shape is then
   * returned directly with no `allOf` wrapper at all (there is no
   * declaration to register/`$ref`). For a *named* `is`-alias base (`model
   * Names is string[];`), the base is still a real declaration — it must go
   * through `buildSchema` so its own docs/validation keywords are preserved
   * and it is registered into `components.schemas` — so a single-branch
   * `{ allOf: [base] }` is returned instead.
   *
   * An **Array** base can never have a non-empty `own` here — TypeSpec
   * itself rejects declaring properties on top of an array's indexer
   * (`no-array-properties`), so `own` is unconditionally empty in that
   * case. A **Record** base has no such restriction: `model Bag extends
   * Record<T> { count: int32; }` is perfectly legal whenever `count`'s type
   * is compatible with `T`, and `own` then carries real
   * `properties`/`required` that must not be discarded. So the emptiness of
   * `own` — not merely "is the base a collection" — is what decides whether
   * it gets folded into the result.
   *
   * A non-empty `own` against a **named** Record-backed alias base is
   * paired into `{ allOf: [base, own] }`, the same shape a non-collection
   * base gets below — `base` there is a real `$ref` that must stay a
   * distinct branch. Against an **anonymous** Record base, though, there is
   * no `$ref` to keep separate: `baseCollection` is already an inline
   * `{ type: "object", additionalProperties: ... }` object, so it is merged
   * directly with `own` into one flat schema (both share `type: "object"`)
   * rather than wrapped in a needless single-level-deeper `allOf` — same
   * omit-unnecessary-nesting convention this method already applies to the
   * `ownIsEmpty` cases above.
   */
  private applyExtends(model: Model, own: SchemaObject): SchemaObject {
    if (model.baseModel === undefined) {
      return own;
    }
    // An overriding property whose `@encodedName` differs from the same-named
    // ancestor property's makes the usual `{ allOf: [{ $ref: Base }, own] }`
    // shape unsatisfiable (see `findEncodedNameOverrideConflict`'s doc
    // comment): the base branch would still require the ancestor's wire name
    // while `own` requires the override's, and a real payload can only ever
    // carry one of the two. Detected here, before any of the collection/
    // named-base branching below, since it can only arise from a named
    // (property-bearing) ancestor — an array base can never have a
    // conflicting property (TypeSpec's own `no-array-properties` rule
    // forbids declaring properties on top of one), so this check never
    // affects the array-base branches.
    const conflict = findEncodedNameOverrideConflict(this.program, model);
    if (conflict !== undefined) {
      reportDiagnostic(this.program, {
        code: "encoded-name-override-conflict",
        target: model,
        format: { property: conflict.property.name, reason: conflict.reason },
      });
      return this.buildFlattenedObjectSchema(model);
    }
    // A `never`-typed override of an inherited property means that property
    // does not exist on `model` (see `isNeverTypedProperty`), but `own` never
    // consults the base's properties — so the usual `{ allOf: [{ $ref: Base
    // }, own] }` shape would still require it via the `$ref` branch. Flatten
    // instead, same fallback (and same reasoning) as the encoded-name
    // conflict above: `buildFlattenedObjectSchema` walks
    // `walkPropertiesInherited`, which both gives the `never` override
    // precedence over the ancestor's definition and already skips
    // `never`-typed properties entirely.
    const neverOverride = findNeverOverrideOfInheritedProperty(model);
    if (neverOverride !== undefined) {
      reportDiagnostic(this.program, {
        code: "never-typed-property-override",
        target: model,
        format: { property: neverOverride.name },
      });
      return this.buildFlattenedObjectSchema(model);
    }
    const ownKeys = Object.keys(own);
    const ownIsEmpty = ownKeys.length === 1 && ownKeys[0] === "type";
    const baseCollection = this.buildCollectionSchema(model.baseModel);
    if (baseCollection !== undefined) {
      const isAnonymous = isBuiltinCollectionInstantiation(model.baseModel);
      if (ownIsEmpty) {
        // See the doc comment above: `own` is guaranteed empty here, so a
        // single-branch `allOf` (or the bare collection shape for an
        // anonymous base) cannot produce a contradictory sibling `type`.
        if (isAnonymous) {
          return baseCollection;
        }
        return { allOf: [this.buildSchema(model.baseModel)] };
      }
      if (isAnonymous) {
        return { ...baseCollection, ...own };
      }
      return { allOf: [this.buildSchema(model.baseModel), own] };
    }
    const base = this.buildSchema(model.baseModel);
    if (ownIsEmpty) {
      return { allOf: [base] };
    }
    return { allOf: [base, own] };
  }

  /**
   * Applies `@discriminator` (the older, `extends`-chain-based decorator —
   * see plan 2.9) to the fully-assembled `schema` for `model`. AsyncAPI 3.x's
   * Schema Object represents it as a bare string naming the discriminating
   * property, unlike OpenAPI 3.0's `{ propertyName, mapping }` object.
   *
   * AsyncAPI 3.x (via draft-07) requires the discriminating property to (a)
   * actually be defined on this schema and (b) be in `required` — emitting
   * `discriminator` for a property that fails either check would produce a
   * schema naming a property no reader could find, which is worse than
   * omitting the keyword. Both checks are reported as a diagnostic (rather
   * than silently dropped) since `@typespec/compiler` itself never validates
   * this.
   *
   * `@discriminator("x")` names the property by its **TypeSpec** declaration
   * name, not its wire name — `getDiscriminator`'s `propertyName` is exactly
   * what appears in the TypeSpec source, before any `@encodedName` remap.
   * The property is looked up by `p.name` accordingly; only once found is
   * its wire name (via `resolveEncodedName`) computed and written into
   * `schema.discriminator`, since that is the key that actually appears
   * under `properties`/`required` (see `buildObjectSchema`). Matching wire
   * name against `discriminator.propertyName` (as an earlier version of
   * this method did) silently breaks the moment the discriminating property
   * has its own `@encodedName`.
   *
   * The lookup walks `model`'s inherited chain (via `findDiscriminatingProperty`)
   * rather than only `model.properties`: for a derived model the assembled
   * `schema` is `{ allOf: [{ $ref: Base }, own] }`, and the discriminating
   * property may live on `Base` rather than `model` itself — the presence
   * check must agree with the schema it is actually checking.
   *
   * Deliberate lenient interpretation (plan 2.9, `plan/review/solved/
   * 2026-08-14-93-discriminator-inherited-property-no-own-definition.md`):
   * when the discriminating property is found only on an ancestor (`Base`
   * above), this method still writes `discriminator` onto `schema` even
   * though `schema` itself — as opposed to the assembled `allOf: [{ $ref:
   * Base }, own]` — has no own `properties`/`required` naming it. AsyncAPI
   * 3.x's Schema Object text says the property "MUST be defined at this
   * schema and ... in the required property list", read literally that
   * would require copying the ancestor's property definition into `own` on
   * every discriminated subtype. This is intentionally not done: a
   * `discriminator` is read after resolving `allOf` (every validator and
   * codegen this project has checked against does so), so a property
   * defined in an `allOf` branch reachable via `$ref` is, in practice,
   * "defined at this schema". Copying it into every subtype's `own` would
   * duplicate the property's definition (base and every subtype, kept in
   * sync by hand) for no behavioral gain, and would fight the same
   * omit-duplication principle `applyExtends` already follows (`own`
   * excludes inherited members precisely so they are not double-counted
   * against the base's `$ref`). Do not "fix" this by re-declaring the
   * property in `own` — that is the discussed and rejected alternative, not
   * an oversight.
   */
  private applyDiscriminator(model: Model, schema: SchemaObject): SchemaObject {
    const discriminator = getDiscriminator(this.program, model);
    if (discriminator === undefined) {
      return schema;
    }
    const prop = findDiscriminatingProperty(model, discriminator.propertyName);
    if (prop === undefined) {
      reportDiagnostic(this.program, {
        code: "missing-discriminator-property",
        target: model,
        format: { property: discriminator.propertyName },
      });
      return schema;
    }
    if (prop.optional) {
      reportDiagnostic(this.program, {
        code: "optional-discriminator-property",
        target: model,
        format: { property: discriminator.propertyName },
      });
      return schema;
    }
    const wireName = resolveEncodedName(this.program, prop, SCHEMA_ENCODING_MIME_TYPE);
    return { ...schema, discriminator: wireName };
  }

  /** Builds the `object` shape for a plain (non-collection) model. */
  private buildObjectSchema(model: Model): SchemaObject {
    return this.buildObjectSchemaFromProperties(model.properties.values());
  }

  /**
   * The fully flattened `object` shape for `model`: every property reachable
   * through the `baseModel` chain (an overriding property in a more-derived
   * level winning over the same-named ancestor's, exactly as
   * `walkPropertiesInherited` already resolves), inlined into one schema with
   * no `allOf`/`$ref` to an ancestor. Used by `applyExtends` as the fallback
   * when `findEncodedNameOverrideConflict` finds an override whose
   * `@encodedName` differs from its ancestor's — the normal `{ allOf: [{
   * $ref: Base }, own] }` shape would then key the base branch and the own
   * branch by two different wire names for the same conceptual property,
   * making the assembled schema reject every valid payload.
   */
  private buildFlattenedObjectSchema(model: Model): SchemaObject {
    const schema = this.buildObjectSchemaFromProperties(walkPropertiesInherited(model));
    // The flattened shape has no `$ref`/`allOf` back to any ancestor, so an
    // indexer constraint (`additionalProperties`) declared on `model` itself
    // or inherited from a `baseModel` would otherwise be silently dropped —
    // walk the chain (mirroring how the compiler itself resolves an
    // inherited indexer) for the nearest one and merge it in.
    for (
      let current: Model | undefined = model;
      current !== undefined;
      current = current.baseModel
    ) {
      const collection = this.buildCollectionSchema(current);
      if (collection !== undefined) {
        return { ...collection, ...schema };
      }
    }
    return schema;
  }

  /**
   * Shared body of `buildObjectSchema`/`buildFlattenedObjectSchema`: builds
   * the `object` shape (`properties`/`required`, omit-empty) from whichever
   * set of properties the caller hands it — a model's own declared
   * properties for the normal (non-conflicting) case, or the fully
   * `baseModel`-flattened set for the encoded-name-override-conflict
   * fallback.
   */
  private buildObjectSchemaFromProperties(properties: Iterable<ModelProperty>): SchemaObject {
    const propertySchemas: Record<string, SchemaObject | ReferenceObject> = Object.create(
      null,
    ) as Record<string, SchemaObject | ReferenceObject>;
    const required: string[] = [];
    // Guards against a wire-name collision between two *distinct* TypeSpec
    // properties (as opposed to one property overriding another of the same
    // TypeSpec name, which `walkPropertiesInherited`'s own by-name dedup
    // already collapses to a single yielded property). This can only arise
    // via the `buildFlattenedObjectSchema` fallback `applyExtends` uses for
    // `findEncodedNameOverrideConflict`'s "different name, same wire name"
    // case: `walkPropertiesInherited` yields the more-derived model's own
    // property first, so the first property to claim a given wire name here
    // is always the most-derived one — matching the override precedence the
    // rest of this codebase already gives same-named overrides. Without this
    // guard a later (less-derived) property with the same wire name would
    // silently overwrite `propertySchemas` and push a duplicate entry onto
    // `required`.
    const claimedWireNames = new Set<string>();

    for (const prop of properties) {
      // A never-typed property means "this property does not exist" (e.g. a
      // template default `model Env<T = never> { data: T; }` instantiated as
      // `Env` with no type argument, or a direct `x: never` declaration).
      // Emitting it — let alone requiring it — would make the schema
      // unsatisfiable, so skip it entirely. Standalone `never` still maps to
      // `{ not: {} }`.
      if (isNeverTypedProperty(prop)) {
        continue;
      }
      // The compiler's own example serializer (`serializeValueAsJson`, used
      // by `buildDocFields` below) resolves each nested object property name
      // through `@encodedName` for `SCHEMA_ENCODING_MIME_TYPE`; the schema's
      // own property key must match it, or a model-level/property-level
      // `@example` naming this property by its wire name would fail
      // validation against `required`/`properties` here.
      const wireName = resolveEncodedName(this.program, prop, SCHEMA_ENCODING_MIME_TYPE);
      if (claimedWireNames.has(wireName)) {
        continue;
      }
      claimedWireNames.add(wireName);
      propertySchemas[wireName] = withPropertyDocs(
        this.program,
        prop,
        this.buildSchema(prop.type),
        this.diagnosedTargets,
      );
      if (!prop.optional) {
        required.push(wireName);
      }
    }

    const schema: SchemaObject = { type: "object" };
    // Omit empty fields instead of emitting `properties: {}` (same
    // omit-empty convention `required` follows below).
    if (Object.keys(propertySchemas).length > 0) {
      schema.properties = propertySchemas;
    }
    if (required.length > 0) {
      schema.required = required;
    }
    return schema;
  }

  private buildScalarSchema(scalar: Scalar): SchemaObject {
    // TypeSpec's own built-in scalars (`string`, `int32`, ...) carry their
    // own standard-library doc comments (e.g. `string` → "A sequence of
    // textual characters."); surfacing those on every plain `string`/`int32`
    // field would flood the output, so only a user-declared scalar's own
    // documentation is applied here. `buildScalarSchemaShapeWithDocs` walks
    // the whole `baseScalar` chain so documentation on an intermediate/base
    // user scalar is not lost when the use site is derived through more than
    // one level (e.g. `scalar WorkEmail extends Email;` where only `Email`
    // itself carries `@doc`/`@summary`/`@example`).
    return this.buildScalarSchemaShapeWithDocs(scalar);
  }

  /**
   * The `type`/`format` shape for `scalar`, merged with documentation
   * collected along the entire `baseScalar` chain: the base's own docs are
   * applied first, then each more-derived level's own `@summary`/`@doc`
   * /`@example` overrides them (`withDocs`'s object-spread semantics already
   * give the more specific fields priority when merged last). Built-in
   * scalars never contribute documentation (see `isBuiltinScalar` at the
   * `buildScalarSchema` call site's doc comment) — only the shape. Bottoms
   * out at the first built-in ancestor found (or the unconstrained `{}`
   * shape for an unmapped root scalar) and merges each user-declared level's
   * docs back on the way up. `withPropertyDocs` on the use site can still
   * override with the property's own documentation afterwards.
   */
  private buildScalarSchemaShapeWithDocs(scalar: Scalar): SchemaObject {
    if (isBuiltinScalar(scalar)) {
      const shape = Object.hasOwn(SCALAR_SCHEMAS, scalar.name)
        ? { ...SCALAR_SCHEMAS[scalar.name] }
        : {};
      // Built-ins never contribute *documentation* (see this method's own
      // doc comment), but an augment decorator (`@@minLength(TypeSpec.string,
      // 3);`) is the only legal way to apply a 2.8 validation decorator to a
      // built-in scalar, and it is real user intent — not library noise — so
      // it must still be read back here rather than silently discarded.
      return { ...shape, ...buildValidationKeywords(this.program, scalar, this.diagnosedTargets) };
    }
    // Derived (user-declared) scalar: start from its base scalar's shape
    // (recursing all the way to a built-in ancestor, or `{}` for an unmapped
    // root scalar), then merge this level's own documentation on top.
    //
    // A validation keyword this level re-declares that the base already
    // baked in (e.g. `@minLength(2) scalar Loose extends Tight;` where
    // `Tight` already has `@minLength(5)`) must NOT simply replace the
    // base's value the way plain object-spread would — two constraints on
    // the same value are a JSON Schema intersection (both must hold), same
    // as the property-vs-scalar collision `withPropertyDocs` guards against.
    // Otherwise a more-derived scalar could silently erase a stricter
    // ancestor constraint with no diagnostic. On collision, `base` is
    // wrapped whole in `allOf` (same wrap `withPropertyDocs` uses) so both
    // levels' keywords hold simultaneously; otherwise keywords are merged in
    // directly as before.
    const base = scalar.baseScalar ? this.buildScalarSchemaShapeWithDocs(scalar.baseScalar) : {};
    return withDocs(this.program, scalar, base, this.diagnosedTargets);
  }
}
