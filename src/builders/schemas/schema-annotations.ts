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
  getExamples,
  serializeValueAsJson,
  $example,
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
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../../types/index.js";
import { reportDiagnostic } from "../../lib.js";
import { getJsonSchemaExtensions, JsonSchemaExtensionRecord } from "../../decorators/index.js";
import { makeSerializeHandlers } from "../example-serialization.js";
import { orderBySourceNodes } from "../source-order.js";

/**
 * The mime type a schema's own property keys are resolved against through
 * `@encodedName`.
 * An `@example`'s object keys are resolved against it too, via the
 * compiler's own `serializeObjectValueAsJson`.
 * This value is hardcoded because 2.7 has no notion yet of a message's
 * actual wire `contentType`. A model with both
 * `@encodedName("application/json", ...)` and
 * `@encodedName("application/xml", ...)`, for example, always emits the
 * JSON name. It does this regardless of which content type a message
 * actually declares.
 * Phase 3 adds per-message content types. It must thread the real
 * `contentType` through to both this constant's use site and the example
 * serialization it keeps in sync with, instead of assuming JSON everywhere.
 */
export const SCHEMA_ENCODING_MIME_TYPE = "application/json";

/**
 * Builds `title`/`description`/`examples` from a declaration's own
 * documentation decorators.
 * `@summary` maps to `title`. `@doc`, or a plain doc comment that `getDoc`
 * already resolves to the same thing, maps to `description`. TypeSpec's
 * built-in `@example` maps to `examples`.
 * Each example value is serialized to plain JSON against `exampleValueType`,
 * in source order (see `orderBySourceNodes`).
 * A value `serializeValueAsJson` cannot represent causes that whole example
 * to be dropped. This covers an unsupported scalar constructor anywhere in
 * the value, including nested inside an array or object, and a function
 * value. The example is dropped rather than left to throw past this
 * builder, or to leak in as a JSON `null` or a silently-missing key. Either
 * way, the example carries no usable information.
 * A dropped example still reports the `unserializable-example` warning
 * diagnostic. It targets the declaration or property the `@example` was
 * applied to. So the drop is not completely silent, even though the
 * emitted schema itself has no field to say so.
 * Each dropped example reports once per target, thanks to `reported`. One
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
 */
function buildDocFields(
  program: Program,
  target: Model | Scalar | Enum | Union | ModelProperty | UnionVariant,
  exampleValueType: Type,
  reported: Map<Type, Set<string>>,
): Pick<SchemaObject, "title" | "description" | "examples"> {
  const title = getSummary(program, target);
  const description = getDoc(program, target);
  const handlers = makeSerializeHandlers(program);
  // `@example`'s own `extern dec` declaration legally targets `UnionVariant`
  // (see `decorators.tsp`). But `getExamples`'s exported TS signature omits
  // it. This is a typing gap in `@typespec/compiler` itself, not a real
  // runtime restriction; its state is stored generically over `Type`.
  // The cast below only widens the static type to match what the decorator
  // already allows.
  const rawExamples = getExamples(program, target as Model | Scalar | Enum | Union | ModelProperty);
  const exampleNodes = target.decorators.filter((d) => d.decorator === $example).map((d) => d.node);
  const examples = orderBySourceNodes(program, exampleNodes, rawExamples)
    .map((example, index) => {
      try {
        return serializeValueAsJson(program, example.value, exampleValueType, undefined, handlers);
      } catch {
        // An example that carries no usable information is dropped rather
        // than left to crash the whole emit. This covers an unserializable
        // scalar per `UnserializableValueError`, and any other failure.
        // For example, the compiler's own duration serializer throws a
        // plain `RangeError` from `Temporal.Duration.from` on a malformed
        // `duration.fromISO(...)` value that the compiler never validates.
        // Still surface the drop as a diagnostic, rather than dropping it
        // in total silence.
        let keys = reported.get(target);
        if (keys === undefined) {
          keys = new Set();
          reported.set(target, keys);
        }
        const key = `unserializable-example:${String(index)}`;
        if (!keys.has(key)) {
          keys.add(key);
          reportDiagnostic(program, { code: "unserializable-example", target });
        }
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
 * Reports a range-constraint diagnostic at most once per `target`,
 * `decorator`, and `SchemaBuilder` instance triple.
 * Named models, enums, and unions are only ever built once, thanks to
 * `registerNamed`'s cache. So any diagnostic `buildValidationKeywords`
 * reports for them is naturally reported once too.
 * A scalar has no such cache. `buildScalarSchemaShapeWithDocs` re-walks the
 * whole `baseScalar` chain at every use site. Without this guard, the same
 * offending decorator would be re-reported once per property that uses the
 * scalar.
 * `reported` is threaded down from a `SchemaBuilder` instance's own `Map`
 * (see `SchemaBuilder.diagnosedTargets`). This scopes the dedup to one
 * builder and one emit, rather than sharing it globally.
 * Keying on `decorator`, not just on `target`/`code`, matters too. One
 * diagnostic code covers several distinct decorators. Both `@minLength` and
 * `@maxLength`, for example, map to `unrepresentable-numeric-constraint`. A
 * target with two independently overflowing constraints must still get one
 * diagnostic per constraint. The second must not be silently swallowed by
 * the first's dedup entry.
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
 * Turns `@jsonSchemaExtension`'s accumulated `{ key, value }` records into a
 * plain object of top-level schema keywords, one property per record.
 * A target with no `@jsonSchemaExtension` application returns `{}`, so
 * merging this in is always a no-op for the common case.
 */
function buildJsonSchemaExtensionFields(
  extensions: readonly JsonSchemaExtensionRecord[],
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const { key, value } of extensions) {
    fields[key] = value;
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
  docs: Pick<SchemaObject, "title" | "description" | "examples">,
  restValidation: SchemaObject,
  format: string | undefined,
): SchemaObject {
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
  reported: Map<Type, Set<string>>,
): SchemaObject {
  const docs = buildDocFields(program, target, target, reported);
  const validation = buildValidationKeywords(program, target, reported);
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
      ? buildJsonSchemaExtensionFields(getJsonSchemaExtensions(program, target))
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
  reported: Map<Type, Set<string>>,
): SchemaObject | ReferenceObject {
  const docs = buildDocFields(program, prop, prop.type, reported);
  const validation = buildValidationKeywords(program, prop, reported);
  // `@jsonSchemaExtension` only legally targets `Model | ModelProperty` (see
  // `lib/main.tsp`); a `UnionVariant` never carries one, so this is always
  // `{}` in that case. These fields are merged in last, after everything
  // else, deliberately. See `withDocs`'s matching comment for the
  // collision-priority rationale.
  const extensionFields =
    prop.kind === "ModelProperty"
      ? buildJsonSchemaExtensionFields(getJsonSchemaExtensions(program, prop))
      : {};
  const extra = { ...docs, ...validation, ...extensionFields };
  if (Object.keys(extra).length === 0) {
    return schema;
  }
  if ("$ref" in schema) {
    return { allOf: [schema], ...extra };
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
    (key) => key in (schema as Record<string, unknown>),
  );
  if (collidesWithOwnShape) {
    // Same annotation-hoisting rule as `withDocs`. `title`/`description`/
    // `examples` left inside the `allOf` branch would not propagate to the
    // parent schema. A property that only adds a colliding validation
    // keyword, with no `@doc` of its own, must not lose the scalar's
    // inherited description.
    return {
      ...hoistAnnotationsAboveAllOf(schema, docs, restValidation, format),
      ...extensionFields,
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
  const rest: SchemaObject = { ...schema };
  if (docs.title !== undefined || docs.description !== undefined) {
    delete rest.title;
    delete rest.description;
  }
  return { ...rest, ...extra };
}
