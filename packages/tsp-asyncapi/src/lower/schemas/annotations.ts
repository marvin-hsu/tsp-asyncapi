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
import { SCHEMA_FORMAT } from "tsp-asyncapi-core";
import { SchemaDiagnostics } from "./diagnostics.js";
import { getJsonSchemaExtensions } from "tsp-asyncapi-core";
import type { JsonSchemaExtensionRecord } from "tsp-asyncapi-core";
import { serializeExamples, serializeDefaultValue } from "tsp-asyncapi-core";
import { toPlainValue } from "tsp-asyncapi-core";
import { buildExternalDocs } from "tsp-asyncapi-core";
import { applyEncoding } from "./encoding.js";

/**
 * The annotation keywords a declaration or a use site contributes.
 * These describe the value for a reader. None of them changes whether a
 * value validates. That distinction is what lets them be hoisted out of an
 * `allOf` branch, which `hoistAnnotationsAboveAllOf` relies on.
 */
type DocFields = Pick<
  SchemaObject,
  "title" | "description" | "examples" | "deprecated" | "externalDocs"
>;

/**
 * Builds `title`/`description`/`examples`/`deprecated` from a declaration's
 * own documentation decorators.
 * `@summary` maps to `title`. `@doc`, or a plain doc comment that `getDoc`
 * already resolves to the same thing, maps to `description`. TypeSpec's
 * built-in `@example` maps to `examples`.
 * Each example value is serialized to plain JSON against `exampleValueType`,
 * in source order. `serializeExamples` owns that step, and the channel
 * parameter builder uses the same one.
 * A value the serializer cannot represent is dropped there. The example is
 * dropped rather than left to throw past this builder, or to leak in as a
 * JSON `null` or a silently-missing key. Either way, the example carries no
 * usable information.
 * A dropped example still reports the `unserializable-example` warning
 * diagnostic. It targets the declaration or property the `@example` was
 * applied to. So the drop is not completely silent, even though the
 * emitted schema itself has no field to say so.
 * Each dropped example reports once per target, thanks to `diagnostics`. One
 * model can be built twice: a message that lifts `@header` fields emits a
 * payload declaration next to the model's own. One unserializable value is
 * one mistake, so the user hears about it once. The dedup key holds the
 * position of the example, so a target with two bad examples still gets two
 * diagnostics.
 * This function omits any field whose decorator was not applied, per the
 * emitter's omit-empty convention.
 *
 * Note: `ExampleOptions`'s `title`/`description`, the `@example`'s second
 * argument, are deliberately not read here.
 * draft-07's `examples` keyword is a bare array of values. It has nowhere
 * to hang a per-entry title or description, so this phase has no field to
 * put them in. Phase 3 adds message-level examples, which have their own
 * `name`/`summary` fields. That is where they get picked up.
 *
 * `#deprecated` maps to the `deprecated` annotation. The compiler stores a
 * message with it, such as `#deprecated "use v2 instead"`. JSON Schema's
 * `deprecated` is a bare boolean with nowhere to carry that message, so only
 * its presence is emitted. The compiler already reports the message itself
 * at every use site, so it does not go unseen.
 *
 * `@externalDocs` maps to `externalDocs`. AsyncAPI's Schema Object defines it
 * alongside `discriminator` and `deprecated` as one of the three fields it
 * adds on top of draft-07. A model that is also a message emits it on both
 * the message and its schema, which is the same thing `@doc` already does.
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
  // A dropped example still surfaces as a diagnostic, rather than being
  // dropped in total silence. Each example is its own drop, so the
  // source-order index separates them. Two bad examples on one target are
  // two mistakes and get two reports.
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
 * The compiler's own `get*Value*` accessors, such as `getMinValue`, silently
 * return `undefined` in two cases. One is when the decorator was never
 * applied. The other is when it was applied but the stored value cannot be
 * represented as a JS `number`. This second case happens when the value
 * overflows, for example `@maxValue(9223372036854775807) v: int64;`, or
 * loses precision, for example a `decimal128` bound with more significant
 * digits than a JS `number` carries. This is per that accessor's own doc
 * comment.
 * Reading the raw `Numeric` first, via `get*ValueAsNumeric`, distinguishes
 * the two cases. A defined `Numeric` whose `asNumber()` is `null` means the
 * decorator *was* applied but cannot be emitted. That case is reported as a
 * diagnostic instead of vanishing without a word.
 *
 * Separately, `@minValue`/`@maxValue` also legally target a temporal scalar
 * such as `utcDateTime`, `plainDate`, or `duration`. In that case the
 * compiler stores a `ScalarValue` rather than a `Numeric`, and the numeric
 * accessor above returns `undefined` by construction.
 * This function reads that case back via the `get*ValueForScalar` sibling
 * accessor, so it is diagnosed too, rather than being silently
 * indistinguishable from "decorator absent".
 * draft-07 has no keyword to express a bound on a `string`-typed schema,
 * such as one with `format: date-time`. So this case can only ever be
 * diagnosed, never emitted.
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
 * These decorators' own `get*` accessors have the exact same silent-collapse
 * problem `resolveRangeBound`'s doc comment describes for
 * `@minValue`/`@maxValue`.
 * Their signature is `value: valueof integer`, arbitrary precision. The
 * plain accessor, `get*AsNumeric(...)?.asNumber() ?? undefined`, cannot
 * distinguish "decorator absent" from "decorator applied but the value
 * overflows a JS `number`". Both simply come back `undefined`.
 * Reading the raw `Numeric` first, and checking `asNumber()` for `null`,
 * recovers that distinction, the same way `resolveRangeBound` does.
 * Unlike `@minValue`/`@maxValue`, none of these four decorators may legally
 * target a temporal scalar. So there is no `ScalarValue` sibling case to
 * check here.
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
 * `decorator`, and `SchemaBuilder` instance triple.
 * Named models, enums, and unions are only ever built once, thanks to
 * `registerNamed`'s cache. So any diagnostic `buildValidationKeywords`
 * reports for them is naturally reported once too.
 * A scalar has no such cache. `buildScalarSchemaShapeWithDocs` re-walks the
 * whole `baseScalar` chain at every use site. Without this guard, the same
 * offending decorator would be re-reported once per property that uses the
 * scalar.
 * The decorator name is passed as the dedup discriminator, so it is keyed on
 * more than `target` and `code`. One diagnostic code covers several distinct
 * decorators. Both `@minLength` and `@maxLength`, for example, map to
 * `unrepresentable-numeric-constraint`. A target with two independently
 * overflowing constraints must still get one diagnostic per constraint. The
 * second must not be silently swallowed by the first's dedup entry.
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
 * built-in validation decorators (2.8).
 * The string keywords are `minLength`/`maxLength`/`pattern`/`format`.
 * The numeric keywords are `minimum`/`maximum`/`exclusiveMinimum`/
 * `exclusiveMaximum`. These use draft-07's numeric-value form, not the
 * draft-06+ boolean-flag form. See `resolveRangeBound` for how an
 * unrepresentable or temporal bound is diagnosed rather than silently
 * dropped.
 * The array keywords are `minItems`/`maxItems`.
 * Each of these decorators legally targets either a scalar or model
 * declaration directly, such as `@minLength(2) scalar Username extends
 * string;`, or a `ModelProperty`, such as `@minLength(2) name: string;`.
 * The compiler's own `get*` accessors read state keyed by whichever `Type`
 * the decorator was actually applied to. So passing either kind of target
 * here just works.
 * A decorator that does not apply to `target`'s own kind simply reads back
 * `undefined` here. For example, `@minLength` can never legally reach a
 * numeric scalar; the checker itself rejects that at compile time. So all
 * accessors can be called unconditionally, without first switching on what
 * shape `target` is.
 * This function omits every field whose decorator was not applied, per the
 * emitter's omit-empty convention.
 *
 * There is no `@uniqueItems`, or equivalent, decorator in
 * `@typespec/compiler` 1.14.0's standard library. Only `@minItems`/
 * `@maxItems` exist for arrays. So `uniqueItems` is not produced here; it
 * has no source decorator to read.
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
  // `@secret` marks a string as sensitive. JSON Schema has no keyword of its
  // own for that, so it maps to the `password` format, the same spelling
  // `@typespec/openapi3` uses.
  // An explicit `@format` wins over it. `@secret` only says the value is
  // sensitive, while `@format` says what the value actually is, which is the
  // more specific statement. This is the same precedence the official
  // emitter applies: it sets `password` first and lets `@format` overwrite it.
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
 * The value is serialized against the property's own type, through the same
 * path an `@example` value takes. So a default and an example of one property
 * always agree on how a value of that type reaches JSON.
 *
 * A value the serializer cannot represent reports `unserializable-default`
 * and contributes no keyword. Emitting a partially-serialized default would
 * put a value in the schema that the schema itself rejects. Dropping it
 * silently would leave the user with no way to find out.
 *
 * A property with no default contributes `{}`, so merging this in is a no-op
 * for the common case.
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
 * plain object of top-level schema keywords, one property per record.
 * A target with no `@jsonSchemaExtension` application returns `{}`, so
 * merging this in is always a no-op for the common case.
 *
 * The decorator stores the value as the compiler marshalled it. That is plain
 * JavaScript for a string, a number and a boolean, and it is the compiler's
 * own value object for a scalar such as `utcDateTime`. So the value goes
 * through `toPlainValue` here, the same rule every binding decorator uses.
 * Writing the marshalled object straight into the schema would emit the
 * compiler's internals.
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
 * Wraps `schema` in `allOf` and hoists `title`/`description`/`examples`
 * above it. `withDocs` and `withPropertyDocs` both call this on a
 * validation-keyword collision. Left inside the `allOf` branch, these three
 * fields would not propagate to the parent schema. This level's own value,
 * from `docs`, wins when present. Otherwise, the inherited value already on
 * `schema` is carried up instead of being silently dropped. `restValidation`
 * and `format` are then merged onto the wrapper: `format` last, so this
 * level's `format`, if any, wins over the base's.
 */
function hoistAnnotationsAboveAllOf(
  schema: SchemaObject,
  docs: DocFields,
  restValidation: SchemaObject,
  format: string | undefined,
): SchemaObject {
  const inner: SchemaObject = { ...schema };
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
 * keywords (2.8) onto its schema body.
 * This schema body is always plain, never a bare `$ref` to itself. It is
 * used for the model, enum, union, and scalar bodies built inside
 * `registerNamed` and `buildScalarSchemaShapeWithDocs`.
 * Enum and union are never a legal target of any 2.8 validation decorator.
 * So merging `buildValidationKeywords` in for them is a no-op. This merge
 * is still done unconditionally, so every named-declaration kind shares
 * this one function, instead of splitting into a docs-only variant and a
 * docs-plus-validation variant.
 */
export function withDocs(
  program: Program,
  target: Model | Scalar | Enum | Union,
  schema: SchemaObject,
  diagnostics: SchemaDiagnostics,
): SchemaObject {
  const docs = buildDocFields(program, target, target, diagnostics);
  const validation = buildValidationKeywords(program, target, diagnostics);
  // `format` is a draft-07 *annotation*, and an assertion under a
  // format-assertion vocabulary. It is not a keyword that can be
  // intersected, unlike `minLength`/`pattern`/`minimum`. Two different
  // `format`s on the same value are a contradiction, not a valid `allOf`
  // intersection.
  // So `format` is excluded from the collision set below. It is always
  // merged last, so this level's `format`, if any, wins over the base's.
  const { format, ...restValidation } = validation;
  // A derived scalar can re-declare a validation keyword its base scalar
  // already baked into `schema` (see `buildScalarSchemaShapeWithDocs`).
  // Plain object-spread must not silently replace that keyword. Two
  // constraints on the same value form a JSON Schema intersection; both
  // must hold.
  // On collision, wrap `schema` whole in `allOf`, the same wrap
  // `withPropertyDocs` uses for the property-vs-scalar case. This layers
  // this level's keywords as siblings, instead of merging them into the
  // same object.
  // Model, enum, and union targets never hit this branch in practice.
  // `schema` for them is a freshly-built body with no validation keywords
  // already baked in to collide with.
  const collidesWithBase = Object.keys(restValidation).some(
    (key) => key in (schema as Record<string, unknown>),
  );
  // `@jsonSchemaExtension` only legally targets `Model | ModelProperty` (see
  // `lib/main.tsp`). `Scalar`/`Enum`/`Union` never carry one, so this is
  // always `{}` for them.
  // These fields are merged in last, after everything above, deliberately.
  // A user reaching for this escape hatch to set a keyword this emitter
  // already produces from a dedicated decorator, e.g. `unevaluatedProperties`
  // alongside `@discriminator`-driven keywords, is doing so on purpose. So an
  // extension key always wins over one this builder would otherwise have
  // produced, rather than being silently dropped as "already present".
  const extensionFields =
    target.kind === "Model"
      ? buildJsonSchemaExtensionFields(program, getJsonSchemaExtensions(program, target))
      : {};
  if (collidesWithBase) {
    // `title`/`description`/`examples` are annotations. Left inside the
    // `allOf` branch, they would not propagate to the parent schema. So any
    // reader looking at this level's own `title`/`description` would see
    // nothing whenever an unrelated validation keyword happens to collide.
    // A derived scalar that only adds a validation keyword, with no `@doc`
    // of its own, must not lose the base's inherited description.
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
 * A property typed as a named declaration builds to a bare `$ref` (see
 * `buildSchema`). Per JSON Schema, a `$ref` has no sibling keywords of its
 * own. So a ref is wrapped in `allOf`, to give the property's
 * `title`/`description`/`examples` somewhere valid to live. A plain inline
 * schema gets them merged in directly instead.
 * `prop.type`, not `prop` itself, is passed as the example's value type.
 * Passing `prop` would make `serializeValueAsJson` apply the property's own
 * `@encode` to the example. But `buildScalarSchema` (2.7) does not yet map
 * `@encode` into the schema's `type`/`format`; that is out of scope for
 * this phase (2.8 adds it). Encoding only the example, and not the schema,
 * would produce an example that fails validation against its own
 * property's schema.
 * This function is shared with `buildUnionSchemaBody`, for a union
 * variant's own `@doc`/`@summary`/`@example`. `UnionVariant` has the same
 * `type` shape a `ModelProperty` does, and it is a legal `@example` target
 * per `decorators.tsp`.
 *
 * This function also merges the property's, or variant's, own 2.8
 * validation keywords (`buildValidationKeywords`) the same way.
 * A `@minLength`/`@minValue`/`@minItems`, and so on, applied directly at
 * the property use site, rather than on the underlying scalar or model
 * declaration, needs the exact same $ref-wrap-or-merge handling
 * documentation already gets. Both are "extra keywords this use site
 * contributes on top of its type's own schema".
 * Unlike `title`/`description`, a validation keyword that collides with one
 * already baked into `schema` must NOT simply replace it.
 * `buildScalarSchemaShapeWithDocs` bakes in every 2.8 keyword, not just
 * `type`/`format`. Two constraints declared on the same value form a JSON
 * Schema intersection; both must hold, never a replacement. A property
 * weakening a scalar's own `@minLength`/`@pattern`, and so on, must not
 * silently erase the scalar's stricter constraint.
 * On collision, `schema` is wrapped whole in `allOf`, the same wrap the
 * `$ref` branch already uses. The property's own keywords are then layered
 * as sibling keywords, instead of merged into the same object. JSON Schema
 * requires an `allOf` branch's keywords and any sibling keywords to all
 * hold simultaneously. So this preserves both constraints without needing
 * a per-keyword intersection rule; numeric min/max, regex `pattern`, and so
 * on, all fall out of the same wrap.
 * When there is no collision, the keywords are still merged in directly as
 * before.
 */
export function withPropertyDocs(
  program: Program,
  prop: ModelProperty | UnionVariant,
  schema: SchemaObject | ReferenceObject,
  diagnostics: SchemaDiagnostics,
): SchemaObject | ReferenceObject {
  // The property's own `@encode` rewrites the `type`/`format` it got from its
  // declared type, so it is applied before anything below. An explicit
  // `@format` on the property still wins, being merged in afterwards.
  // A `$ref` is never reached here: a property typed as a named scalar is
  // inlined rather than referenced.
  const encoded =
    prop.kind === "ModelProperty" && !("$ref" in schema)
      ? applyEncoding(program, prop, schema)
      : schema;
  // The example is serialized against `prop`, not `prop.type`, so the compiler
  // applies the same `@encode` to it. An example encoded differently from the
  // schema describing it would fail to validate against that schema.
  const docs = buildDocFields(program, prop, prop, diagnostics);
  const validation = buildValidationKeywords(program, prop, diagnostics);
  // `@jsonSchemaExtension` only legally targets `Model | ModelProperty` (see
  // `lib/main.tsp`); a `UnionVariant` never carries one, so this is always
  // `{}` in that case. These fields are merged in last, after everything
  // else, deliberately. See `withDocs`'s matching comment for the
  // collision-priority rationale.
  const extensionFields =
    prop.kind === "ModelProperty"
      ? buildJsonSchemaExtensionFields(program, getJsonSchemaExtensions(program, prop))
      : {};
  // A `UnionVariant` has no default value to read; only a `ModelProperty`
  // carries one, written as `name?: T = value`.
  const defaultFields =
    prop.kind === "ModelProperty" ? buildDefaultField(program, prop, diagnostics) : {};
  const extra = { ...docs, ...validation, ...extensionFields, ...defaultFields };
  if (Object.keys(extra).length === 0) {
    return encoded;
  }
  if ("$ref" in encoded) {
    return { allOf: [encoded], ...extra };
  }
  // `format` is a draft-07 *annotation*, not a keyword that can be
  // intersected. Two different `format`s on the same value are a
  // contradiction, not a valid `allOf` intersection. So it must never by
  // itself trigger
  // the collision branch below; this is the same reasoning as `withDocs`.
  // It is excluded from the collision set and merged in last, so this
  // level's `format`, if any, wins.
  const { format, ...restValidation } = validation;
  const collidesWithOwnShape = Object.keys(restValidation).some(
    (key) => key in (encoded as Record<string, unknown>),
  );
  if (collidesWithOwnShape) {
    // Same annotation-hoisting rule as `withDocs`. `title`/`description`/
    // `examples` left inside the `allOf` branch would not propagate to the
    // parent schema. A property that only adds a colliding validation
    // keyword, with no `@doc` of its own, must not lose the scalar's
    // inherited description.
    // `default` is an annotation as well, so it belongs beside the `allOf`,
    // not inside its branch, for the same reason.
    return {
      ...hoistAnnotationsAboveAllOf(encoded, docs, restValidation, format),
      ...extensionFields,
      ...defaultFields,
    };
  }
  // The property has its own title and/or description here. It fully
  // determines this use site's title/description. This replaces, rather
  // than merges with, whatever the scalar's own schema shape may have
  // baked in via `buildScalarSchema`. Otherwise, a property overriding only
  // `@summary`, for example, would incoherently keep the underlying
  // scalar's `@doc` as its `description`.
  // `examples` does not affect either field. So a property that only adds
  // its own `@example` must not strip the scalar's inherited
  // `title`/`description`. Gate the deletion only on the fields actually
  // being overridden.
  const rest: SchemaObject = { ...encoded };
  if (docs.title !== undefined || docs.description !== undefined) {
    delete rest.title;
    delete rest.description;
  }
  return { ...rest, ...extra };
}
