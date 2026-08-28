/**
 * The lower half of schema annotations: documentation fields, JSON Schema
 * validation keywords, defaults, and `@jsonSchemaExtension`.
 *
 * `withDocs` and `withPropertyDocs` are the entry points, called once a
 * declaration's or a property's own body has been built. Both merge these
 * fields onto that body, wrapping it in `allOf` when a keyword collides with
 * one the body already carries, so both constraints still hold.
 */

import {
  Type,
  Model,
  ModelProperty,
  Scalar,
  Enum,
  Union,
  UnionVariant,
  Program,
  getDoc,
  getSummary,
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
  getDeprecated,
  isSecret,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../../types/index.js";
import {
  SCHEMA_FORMAT,
  getJsonSchemaExtensions,
  serializeExamples,
  serializeDefaultValue,
  toPlainValue,
  buildExternalDocs,
  type JsonSchemaExtensionRecord,
} from "tsp-asyncapi-core";
import { SchemaDiagnostics } from "./diagnostics.js";
import { applyEncoding } from "./encoding.js";

/**
 * The annotation keywords a declaration or a use site contributes. These
 * describe the value for a reader; none changes whether a value validates.
 * That distinction is what lets `hoistAnnotationsAboveAllOf` hoist them out
 * of an `allOf` branch.
 */
type DocFields = Pick<
  SchemaObject,
  "title" | "description" | "examples" | "deprecated" | "externalDocs"
>;

/**
 * Builds `title`/`description`/`examples`/`deprecated` from a declaration's
 * own documentation decorators. `@summary` maps to `title`. `@doc`, or a
 * plain doc comment `getDoc` resolves to the same thing, maps to
 * `description`. `@example` maps to `examples`.
 *
 * Each example is serialized to plain JSON against `exampleValueType`, in
 * source order, through `serializeExamples`, the same step the channel
 * parameter builder uses. A value the serializer cannot represent is
 * dropped rather than left to throw, leak in as a JSON `null`, or leave a
 * silently-missing key. The drop still reports the `unserializable-example`
 * warning against the declaration or property the `@example` targeted, once
 * per target: a model can be built twice, when a message that lifts
 * `@header` fields emits a payload declaration next to the model's own, and
 * one mistake should surface once. The dedup key holds the example's
 * position, so two bad examples on one target still get two diagnostics.
 *
 * `ExampleOptions`'s `title`/`description` are deliberately not read here.
 * draft-07's `examples` keyword is a bare array with nowhere to hang a
 * per-entry title or description; message-level examples, which do carry
 * `name`/`summary`, are built separately in `messages.ts`.
 *
 * `#deprecated` maps to the `deprecated` annotation. JSON Schema's
 * `deprecated` is a bare boolean with no field for the message the compiler
 * stores, e.g. `#deprecated "use v2 instead"`, but the compiler already
 * reports that message at every use site.
 *
 * `@externalDocs` maps to `externalDocs`, one of the three fields AsyncAPI's
 * Schema Object adds on top of draft-07 alongside `discriminator` and
 * `deprecated`. A model that is also a message emits it on both the message
 * and its schema, the same as `@doc`.
 *
 * Every field whose decorator was not applied is omitted, per the emitter's
 * omit-empty convention.
 */
function buildDocFields(
  program: Program,
  target: Model | Scalar | Enum | Union | ModelProperty | UnionVariant,
  exampleValueType: Type,
  diagnostics: SchemaDiagnostics,
): DocFields {
  const title = getSummary(program, target);
  const description = getDoc(program, target);
  const deprecated = getDeprecated(program, target) !== undefined ? true : undefined;
  const externalDocs = buildExternalDocs(program, target);
  // The source-order index keys each dropped example's diagnostic.
  const examples = serializeExamples(program, target, exampleValueType, (index) =>
    diagnostics.reportOnce({ code: "unserializable-example", target }, String(index)),
  );
  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(examples.length > 0 ? { examples } : {}),
    ...(deprecated !== undefined ? { deprecated } : {}),
    ...(externalDocs !== undefined ? { externalDocs } : {}),
  };
}

/**
 * Resolves one `@minValue`/`@maxValue`/`@minValueExclusive`/
 * `@maxValueExclusive` bound to the JSON-number field it maps to:
 * `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`.
 *
 * The compiler's `get*Value*` accessors, such as `getMinValue`, silently
 * return `undefined` both when the decorator was never applied and when it
 * was applied but the value cannot be represented as a JS `number`, e.g. an
 * overflowing `@maxValue(9223372036854775807) v: int64;` or a `decimal128`
 * bound with more digits than a JS `number` carries. Reading the raw
 * `Numeric` first, via `get*ValueAsNumeric`, distinguishes the two: a
 * defined `Numeric` whose `asNumber()` is `null` means the decorator was
 * applied but cannot be emitted, and that case is reported as a diagnostic.
 *
 * `@minValue`/`@maxValue` also legally target a temporal scalar such as
 * `utcDateTime`, `plainDate`, or `duration`, where the compiler stores a
 * `ScalarValue` instead of a `Numeric` and the accessor above returns
 * `undefined` by construction. The `get*ValueForScalar` sibling accessor
 * reads that case back so it is diagnosed too, rather than looking like
 * "decorator absent". draft-07 has no keyword for a bound on a
 * `string`-typed schema, such as one with `format: date-time`, so this case
 * can only ever be diagnosed, never emitted.
 */
function resolveRangeBound(
  program: Program,
  target: Type,
  diagnostics: SchemaDiagnostics,
  decorator: string,
  numeric: ReturnType<typeof getMinValueAsNumeric>,
  scalarValue: ReturnType<typeof getMinValueForScalar>,
): number | undefined {
  if (numeric !== undefined) {
    const asNumber = numeric.asNumber();
    if (asNumber === null) {
      reportRangeDiagnosticOnce(
        diagnostics,
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
      diagnostics,
      "unsupported-temporal-range-constraint",
      target,
      decorator,
    );
  }
  return undefined;
}

/**
 * Resolves one `@minLength`/`@maxLength`/`@minItems`/`@maxItems` bound to
 * the JSON-number field it maps to:
 * `minLength`/`maxLength`/`minItems`/`maxItems`.
 *
 * These decorators take `value: valueof integer`, arbitrary precision, and
 * their `get*` accessors have the same silent-collapse problem
 * `resolveRangeBound` describes for `@minValue`/`@maxValue`: the plain
 * accessor cannot distinguish "decorator absent" from "decorator applied
 * but the value overflows a JS `number`". Reading the raw `Numeric` first
 * and checking `asNumber()` for `null` recovers that distinction the same
 * way. Unlike `@minValue`/`@maxValue`, none of these four may legally
 * target a temporal scalar, so there is no `ScalarValue` sibling case here.
 */
function resolveLengthBound(
  program: Program,
  target: Type,
  diagnostics: SchemaDiagnostics,
  decorator: string,
  numeric: ReturnType<typeof getMinLengthAsNumeric>,
): number | undefined {
  if (numeric === undefined) {
    return undefined;
  }
  const asNumber = numeric.asNumber();
  if (asNumber === null) {
    reportRangeDiagnosticOnce(diagnostics, "unrepresentable-numeric-constraint", target, decorator);
    return undefined;
  }
  return asNumber;
}

/**
 * Reports a range-constraint diagnostic at most once per `target`,
 * `decorator`, and `SchemaBuilder` instance.
 *
 * Named models, enums, and unions are only ever built once, thanks to
 * `registerNamed`'s cache, so any diagnostic reported for them is naturally
 * reported once too. A scalar has no such cache. `buildScalarSchemaShapeWithDocs`
 * re-walks the whole `baseScalar` chain at every use site. Without this
 * guard, the same offending decorator would be re-reported per property.
 *
 * The decorator name is the dedup discriminator, keyed on more than
 * `target` and `code`, since one code covers several decorators; both
 * `@minLength` and `@maxLength` map to `unrepresentable-numeric-constraint`.
 * A target with two independently overflowing constraints must still get
 * one diagnostic per constraint, not have the second swallowed by the
 * first's dedup entry.
 */
function reportRangeDiagnosticOnce(
  diagnostics: SchemaDiagnostics,
  code: "unrepresentable-numeric-constraint" | "unsupported-temporal-range-constraint",
  target: Type,
  decorator: string,
): void {
  diagnostics.reportOnce({ code, target, format: { decorator } }, decorator);
}

/**
 * Builds validation keywords contributed by `@typespec/compiler`'s own
 * built-in validation decorators.
 *
 * The string keywords are `minLength`/`maxLength`/`pattern`/`format`. The
 * numeric keywords are `minimum`/`maximum`/`exclusiveMinimum`/
 * `exclusiveMaximum`, using draft-07's numeric-value form rather than the
 * draft-06+ boolean-flag form; see `resolveRangeBound` for how an
 * unrepresentable or temporal bound is diagnosed instead of silently
 * dropped. The array keywords are `minItems`/`maxItems`.
 *
 * Each decorator legally targets a scalar or model declaration directly,
 * e.g. `@minLength(2) scalar Username extends string;`, or a
 * `ModelProperty`, e.g. `@minLength(2) name: string;`. The compiler's
 * `get*` accessors read state keyed by whichever `Type` the decorator was
 * applied to, so passing either kind of target here just works. A
 * decorator that does not apply to `target`'s own kind reads back
 * `undefined`, since the checker itself rejects the mismatch at compile
 * time, so every accessor can be called unconditionally.
 *
 * Every field whose decorator was not applied is omitted, per the
 * emitter's omit-empty convention. `@typespec/compiler`'s standard library
 * has no `@uniqueItems` or equivalent decorator for arrays, so this
 * function never produces `uniqueItems`.
 */
export function buildValidationKeywords(
  program: Program,
  target: Type,
  diagnostics: SchemaDiagnostics,
): Partial<SchemaObject> {
  const minLength = resolveLengthBound(
    program,
    target,
    diagnostics,
    "minLength",
    getMinLengthAsNumeric(program, target),
  );
  const maxLength = resolveLengthBound(
    program,
    target,
    diagnostics,
    "maxLength",
    getMaxLengthAsNumeric(program, target),
  );
  const pattern = getPattern(program, target);
  // `@secret` marks a string as sensitive. JSON Schema has no keyword for
  // that, so it maps to the `password` format, the same spelling
  // `@typespec/openapi3` uses. An explicit `@format` wins, since it says
  // what the value actually is, the more specific statement.
  const format =
    getFormat(program, target) ?? (isSecret(program, target) ? SCHEMA_FORMAT.password : undefined);
  const minimum = resolveRangeBound(
    program,
    target,
    diagnostics,
    "minValue",
    getMinValueAsNumeric(program, target),
    getMinValueForScalar(program, target),
  );
  const maximum = resolveRangeBound(
    program,
    target,
    diagnostics,
    "maxValue",
    getMaxValueAsNumeric(program, target),
    getMaxValueForScalar(program, target),
  );
  const exclusiveMinimum = resolveRangeBound(
    program,
    target,
    diagnostics,
    "minValueExclusive",
    getMinValueExclusiveAsNumeric(program, target),
    getMinValueExclusiveForScalar(program, target),
  );
  const exclusiveMaximum = resolveRangeBound(
    program,
    target,
    diagnostics,
    "maxValueExclusive",
    getMaxValueExclusiveAsNumeric(program, target),
    getMaxValueExclusiveForScalar(program, target),
  );
  const minItems = resolveLengthBound(
    program,
    target,
    diagnostics,
    "minItems",
    getMinItemsAsNumeric(program, target),
  );
  const maxItems = resolveLengthBound(
    program,
    target,
    diagnostics,
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
 * Builds the `default` keyword from a property's own default value, written
 * as `name?: T = value`.
 *
 * The value is serialized against the property's own type, the same path
 * an `@example` value takes, so a default and an example always agree on
 * how a value reaches JSON. A value the serializer cannot represent reports
 * `unserializable-default` and contributes no keyword, rather than putting
 * a value in the schema that the schema itself rejects or dropping it with
 * no way for the user to find out.
 *
 * A property with no default contributes `{}`, a no-op when merged in.
 */
function buildDefaultField(
  program: Program,
  prop: ModelProperty,
  diagnostics: SchemaDiagnostics,
): Pick<SchemaObject, "default"> {
  const value = serializeDefaultValue(program, prop, () =>
    diagnostics.reportOnce({ code: "unserializable-default", target: prop }, "default"),
  );
  return value !== undefined ? { default: value } : {};
}

/**
 * Turns `@jsonSchemaExtension`'s accumulated `{ key, value }` records into a
 * plain object of top-level schema keywords, one property per record. A
 * target with no application returns `{}`, a no-op when merged in.
 *
 * The decorator stores the value as the compiler marshalled it: plain
 * JavaScript for a string, number, or boolean, and the compiler's own value
 * object for a scalar such as `utcDateTime`. The value goes through
 * `toPlainValue` here, the same rule every binding decorator uses, so the
 * schema never emits the compiler's internals directly.
 */
function buildJsonSchemaExtensionFields(
  program: Program,
  extensions: readonly JsonSchemaExtensionRecord[],
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const { key, value } of extensions) {
    fields[key] = toPlainValue(program, value);
  }
  return fields;
}

/**
 * Returns `schema` with `format` removed from it and from every `allOf`
 * branch below it.
 *
 * The removal follows the whole `allOf` spine, not only its first level. An
 * `extends` chain of three scalars wraps one `allOf` inside another. A
 * `format` two levels down still describes the same single value as the one
 * on the wrapper. Depth does not make the two agree.
 *
 * A branch that is a `$ref` keeps its format. That format lives in the
 * component the reference points at, and other values share it.
 *
 * @param schema - The schema to strip
 * @returns A copy with no `format` on any `allOf` level
 */
function withoutFormat(schema: SchemaObject): SchemaObject {
  const stripped: SchemaObject = { ...schema };
  delete stripped.format;
  if (stripped.allOf !== undefined) {
    stripped.allOf = stripped.allOf.map((branch) =>
      "$ref" in branch ? branch : withoutFormat(branch),
    );
  }
  return stripped;
}

/**
 * Wraps `schema` in `allOf` and hoists `title`/`description`/`examples`
 * above it. `withDocs` and `withPropertyDocs` both call this on a
 * validation-keyword collision, since left inside the `allOf` branch these
 * fields would not propagate to the parent schema. This level's own value
 * from `docs` wins when present; otherwise the inherited value already on
 * `schema` is carried up rather than dropped.
 *
 * `restValidation` and `format` merge onto the wrapper last, so this
 * level's `format`, if any, wins over the base's outright: the base's is
 * removed from the branch and any nested `allOf`, not left there beside it.
 * `format` is a draft-07 annotation, not a keyword `allOf` intersects; a
 * branch saying `uuid` under a wrapper saying `email` is a contradiction,
 * not two constraints that both hold. A base format this level says
 * nothing about stays in the branch, where it already describes the value.
 */
function hoistAnnotationsAboveAllOf(
  schema: SchemaObject,
  docs: DocFields,
  restValidation: SchemaObject,
  format: string | undefined,
): SchemaObject {
  const inner: SchemaObject = format !== undefined ? withoutFormat(schema) : { ...schema };
  const title = docs.title ?? inner.title;
  const description = docs.description ?? inner.description;
  const examples = docs.examples ?? inner.examples;
  // `deprecated` and `externalDocs` are annotations, exactly like
  // `title`/`description`. Left inside the `allOf` branch, a reader looking at
  // this level would not see them. So they are hoisted with the rest.
  const deprecated = docs.deprecated ?? inner.deprecated;
  const externalDocs = docs.externalDocs ?? inner.externalDocs;
  delete inner.title;
  delete inner.description;
  delete inner.examples;
  delete inner.deprecated;
  delete inner.externalDocs;
  return {
    allOf: [inner],
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(examples !== undefined ? { examples } : {}),
    ...(deprecated !== undefined ? { deprecated } : {}),
    ...(externalDocs !== undefined ? { externalDocs } : {}),
    ...restValidation,
    ...(format !== undefined ? { format } : {}),
  };
}

/**
 * Merges a declaration's own documentation fields and its own validation
 * keywords onto its schema body.
 *
 * This schema body is always plain, never a bare `$ref` to itself. It is
 * used for the model, enum, union, and scalar bodies built inside
 * `registerNamed` and `buildScalarSchemaShapeWithDocs`. Enum and union are
 * never a legal target of a validation decorator, so merging
 * `buildValidationKeywords` in for them is a no-op, done unconditionally so
 * every named-declaration kind shares this one function.
 */
export function withDocs(
  program: Program,
  target: Model | Scalar | Enum | Union,
  schema: SchemaObject,
  diagnostics: SchemaDiagnostics,
): SchemaObject {
  const docs = buildDocFields(program, target, target, diagnostics);
  const validation = buildValidationKeywords(program, target, diagnostics);
  // `format` is a draft-07 annotation, not a keyword that can be
  // intersected like `minLength`/`pattern`/`minimum`. Two different
  // `format`s on the same value contradict rather than form a valid
  // `allOf` intersection, so it is excluded from the collision set below
  // and always merged last, so this level's `format` wins over the base's.
  const { format, ...restValidation } = validation;
  // A derived scalar can re-declare a validation keyword its base scalar
  // already baked into `schema`. Plain object-spread must not silently
  // replace that keyword, since two constraints on the same value form a
  // JSON Schema intersection and both must hold. On collision, `schema` is
  // wrapped whole in `allOf`, the same wrap `withPropertyDocs` uses, so
  // this level's keywords layer as siblings instead of merging in. Model,
  // enum, and union targets never hit this branch: `schema` for them is a
  // freshly-built body with nothing already baked in to collide with.
  const collidesWithBase = Object.keys(restValidation).some(
    (key) => key in (schema as Record<string, unknown>),
  );
  // `@jsonSchemaExtension` only legally targets `Model | ModelProperty`, so
  // this is always `{}` for `Scalar`/`Enum`/`Union`. These fields merge in
  // last, deliberately: a user reaching for this escape hatch to set a
  // keyword the emitter already produces, e.g. `unevaluatedProperties`
  // alongside `@discriminator`, is doing so on purpose, so an extension
  // key always wins rather than being dropped as "already present".
  const extensionFields =
    target.kind === "Model"
      ? buildJsonSchemaExtensionFields(program, getJsonSchemaExtensions(program, target))
      : {};
  if (collidesWithBase) {
    // `title`/`description`/`examples` left inside the `allOf` branch would
    // not propagate to the parent schema. A derived scalar that only adds
    // a validation keyword, with no `@doc` of its own, must not lose the
    // base's inherited description.
    return {
      ...hoistAnnotationsAboveAllOf(schema, docs, restValidation, format),
      ...extensionFields,
    };
  }
  return {
    ...schema,
    ...docs,
    ...validation,
    ...extensionFields,
  };
}

/**
 * Merges a property's, or union variant's, own documentation fields onto
 * its schema entry.
 *
 * A property typed as a named declaration builds to a bare `$ref`. Per
 * JSON Schema, a `$ref` has no sibling keywords of its own, so a ref is
 * wrapped in `allOf` to give the property's `title`/`description`/
 * `examples` somewhere valid to live; a plain inline schema gets them
 * merged in directly. `prop.type`, not `prop` itself, is passed as the
 * example's value type: passing `prop` would make the serializer apply the
 * property's own `@encode` to the example, but the schema's own
 * `type`/`format` does not carry that encoding, so an example encoded
 * differently from its schema would fail to validate against it.
 *
 * This function is shared with `buildUnionSchemaBody`, for a union
 * variant's own `@doc`/`@summary`/`@example`. `UnionVariant` has the same
 * `type` shape a `ModelProperty` does, and it is a legal `@example` target.
 *
 * It also merges the property's, or variant's, own validation keywords
 * (`buildValidationKeywords`) the same way: extra keywords the use site
 * contributes on top of its type's own schema. Unlike `title`/`description`,
 * a validation keyword colliding with one already baked into `schema` must
 * not simply replace it. `buildScalarSchemaShapeWithDocs` bakes in every
 * such keyword, not just `type`/`format`, and two constraints on the same
 * value form a JSON Schema intersection where both must hold. A property
 * weakening a scalar's own `@minLength`/`@pattern` must not silently erase
 * the scalar's stricter constraint.
 *
 * On collision, `schema` is wrapped whole in `allOf`, the same wrap the
 * `$ref` branch uses, layering the property's own keywords as siblings
 * instead of merging them into the same object. This preserves both
 * constraints without a per-keyword intersection rule; numeric min/max,
 * regex `pattern`, and so on all fall out of the same wrap. With no
 * collision, the keywords still merge in directly.
 */
export function withPropertyDocs(
  program: Program,
  prop: ModelProperty | UnionVariant,
  schema: SchemaObject | ReferenceObject,
  diagnostics: SchemaDiagnostics,
): SchemaObject | ReferenceObject {
  // The property's own `@encode` rewrites the `type`/`format` from its
  // declared type, applied before anything below; an explicit `@format`
  // still wins, merged in afterwards. A `$ref` never reaches here: a
  // property whose `@encode` reaches a named scalar, or a variant of a
  // named union, is written in place instead of referenced.
  const encoded =
    prop.kind === "ModelProperty" && !("$ref" in schema)
      ? applyEncoding(program, prop, schema, diagnostics)
      : schema;
  // The example is serialized against `prop`, not `prop.type`, so it gets
  // the same `@encode`, keeping it valid against the schema describing it.
  const docs = buildDocFields(program, prop, prop, diagnostics);
  const validation = buildValidationKeywords(program, prop, diagnostics);
  // `@jsonSchemaExtension` only legally targets `Model | ModelProperty`; a
  // `UnionVariant` never carries one, so this is always `{}` in that case.
  // See `withDocs`'s matching comment for the merge-order rationale.
  const extensionFields =
    prop.kind === "ModelProperty"
      ? buildJsonSchemaExtensionFields(program, getJsonSchemaExtensions(program, prop))
      : {};
  // A `UnionVariant` has no default value; only a `ModelProperty` carries
  // one, written as `name?: T = value`.
  const defaultFields =
    prop.kind === "ModelProperty" ? buildDefaultField(program, prop, diagnostics) : {};
  const extra = { ...docs, ...validation, ...extensionFields, ...defaultFields };
  if (Object.keys(extra).length === 0) {
    return encoded;
  }
  if ("$ref" in encoded) {
    return { allOf: [encoded], ...extra };
  }
  // `format` is a draft-07 annotation, not an intersectable keyword; two
  // different `format`s on the same value contradict rather than form a
  // valid `allOf` intersection, so, as in `withDocs`, it is excluded from
  // the collision set and merged in last, winning over the base's.
  const { format, ...restValidation } = validation;
  const collidesWithOwnShape = Object.keys(restValidation).some(
    (key) => key in (encoded as Record<string, unknown>),
  );
  if (collidesWithOwnShape) {
    // Same annotation-hoisting rule as `withDocs`: `title`/`description`/
    // `examples` left inside the `allOf` branch would not propagate to the
    // parent schema, and a property that only adds a colliding validation
    // keyword must not lose the scalar's inherited description. `default`
    // is an annotation too, so it belongs beside the `allOf` for the same
    // reason.
    return {
      ...hoistAnnotationsAboveAllOf(encoded, docs, restValidation, format),
      ...extensionFields,
      ...defaultFields,
    };
  }
  // A property's own title/description fully determines this use site's,
  // replacing rather than merging with whatever the scalar's own shape
  // baked in. Otherwise a property overriding only `@summary` would
  // incoherently keep the scalar's `@doc` as its `description`. `examples`
  // does not affect either field, so gate the deletion only on the fields
  // actually being overridden; a property adding only its own `@example`
  // must not strip the scalar's inherited `title`/`description`.
  const rest: SchemaObject = { ...encoded };
  if (docs.title !== undefined || docs.description !== undefined) {
    delete rest.title;
    delete rest.description;
  }
  return { ...rest, ...extra };
}
