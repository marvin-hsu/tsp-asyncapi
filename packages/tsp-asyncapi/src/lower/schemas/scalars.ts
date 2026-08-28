import {
  Model,
  Scalar,
  IntrinsicType,
  Enum,
  EnumMember,
  ModelProperty,
  Program,
  getDoc,
  getEncode,
  getExamples,
  getFormat,
  getSummary,
  isSecret,
} from "@typespec/compiler";
import { ReferenceObject, SchemaObject } from "../../types/index.js";
import { JSON_SCHEMA_TYPE, SCHEMA_FORMAT, isGlobalTypeSpecNamespace } from "tsp-asyncapi-core";
import { SchemaDiagnostics } from "./diagnostics.js";
import { DeclarationRegistry } from "./declarations.js";
import { buildValidationKeywords, withDocs } from "./annotations.js";
import { applyEncoding } from "./encoding.js";

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
export const SCALAR_SCHEMAS: Record<string, SchemaObject> = {
  string: { type: JSON_SCHEMA_TYPE.string },
  boolean: { type: JSON_SCHEMA_TYPE.boolean },
  // Abstract numeric scalars: the width is unspecified, so no `format`.
  numeric: { type: JSON_SCHEMA_TYPE.number },
  integer: { type: JSON_SCHEMA_TYPE.integer },
  float: { type: JSON_SCHEMA_TYPE.number },
  ...withFormat(JSON_SCHEMA_TYPE.integer, {
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
  ...withFormat(JSON_SCHEMA_TYPE.number, {
    float32: "float",
    float64: "double",
    decimal: "decimal",
    decimal128: "decimal128",
  }),
  ...withFormat(JSON_SCHEMA_TYPE.string, {
    bytes: SCHEMA_FORMAT.byte,
    plainDate: SCHEMA_FORMAT.date,
    plainTime: SCHEMA_FORMAT.time,
    utcDateTime: SCHEMA_FORMAT.dateTime,
    offsetDateTime: SCHEMA_FORMAT.dateTime,
    duration: SCHEMA_FORMAT.duration,
    url: SCHEMA_FORMAT.uri,
  }),
};

/**
 * Returns true when `scalar` is one of TypeSpec's own built-in scalars.
 * A built-in scalar is declared in the global `TypeSpec` namespace.
 * A user-declared scalar can share a name with a built-in without being one.
 * For example: `namespace MyLib { scalar duration extends int32; }`.
 * Only a built-in scalar should be looked up directly in `SCALAR_SCHEMAS` by
 * name. A user scalar must instead walk `baseScalar`.
 */
export function isBuiltinScalar(scalar: Scalar): boolean {
  return isGlobalTypeSpecNamespace(scalar.namespace);
}

/**
 * Returns true when `model` is the built-in `Array`/`Record` template.
 * This covers an anonymous instantiation at a use site, such as `string[]`
 * or `Record<int32>`.
 * It excludes a user's own named alias declared with `is`, such as
 * `model Names is string[];`.
 * Only the anonymous use site should stay inlined.
 * A named alias is a real declaration. It must be registered like any other
 * named model.
 * TypeSpec's built-in `Array`/`Record` templates live directly in the global
 * `TypeSpec` namespace. A user-declared alias never does.
 */
export function isBuiltinCollectionInstantiation(model: Model): boolean {
  return isGlobalTypeSpecNamespace(model.namespace);
}

/**
 * Returns true when `prop` is `never`-typed.
 * `buildObjectSchema` uses this same condition to skip a property entirely.
 * A skipped property enters neither `properties` nor `required`.
 * `findDiscriminatingProperty` below shares this check.
 * This makes a `never`-typed discriminating property count as "does not
 * exist", matching how it does not exist in the emitted schema.
 */
export function isNeverTypedProperty(prop: ModelProperty): boolean {
  return prop.type.kind === "Intrinsic" && prop.type.name === "never";
}

/**
 * TypeSpec intrinsic type (`null`, `never`, `void`, `unknown`, error type)
 * → AsyncAPI schema.
 */
export function buildIntrinsicSchema(type: IntrinsicType): SchemaObject {
  switch (type.name) {
    case "null":
      return { type: JSON_SCHEMA_TYPE.null };
    case "never":
    case "void":
      // No value is valid. Nothing matches `{ not: {} }`.
      return { not: {} };
    default:
      // This covers `unknown` and the error type. Any value is valid here.
      return {};
  }
}

/**
 * Converts a TypeSpec `enum` to an AsyncAPI schema.
 * Each member contributes its explicit value, such as `Red: "R"`, when
 * given. Otherwise, it falls back to the member's own name, so
 * `enum Color { Red, Green }` yields the values `"Red"` and `"Green"`. This
 * is the same default TypeSpec itself uses for a member with no explicit value.
 * `type` is `"number"` only when every member ends up with a numeric value.
 * It is `"string"` only when every member ends up with a string value.
 * A mix of the two omits `type` entirely, rather than picking one. `enum`
 * alone already constrains the value, and a mismatched `type` would make
 * the members of the other kind unsatisfiable.
 * An empty enum has no member to be. Like `never`/`void` in
 * `buildIntrinsicSchema`, it returns `{ not: {} }`, meaning nothing is
 * valid, rather than `{}`, meaning anything is valid. `enum: []` would be
 * the literally correct encoding of "no value", but it is not a valid
 * draft-07 schema. `{ not: {} }` stands in as the closest valid equivalent.
 */
export function buildEnumSchemaBody(type: Enum): SchemaObject {
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
 * Builds the schema for a single enum member used as a type on its own.
 * This covers `Color.Red` used directly, or as one variant of a union such
 * as `Color.Red | Color.Green`.
 * This has the same shape as a `string`/`number` literal type: a schema
 * constrained to exactly one value.
 */
export function buildEnumMemberSchema(member: EnumMember): SchemaObject {
  const value = member.value ?? member.name;
  return { type: typeof value === "number" ? "number" : "string", enum: [value] };
}

/**
 * Whether a property says something of its own that would replace, rather
 * than add to, what the scalar says.
 */
export function propertyStatesItsOwnShape(program: Program, prop: ModelProperty): boolean {
  return (
    getEncode(program, prop) !== undefined ||
    getFormat(program, prop) !== undefined ||
    // `@secret` is a format too. It is what `password` is written from
    // (see `buildValidationKeywords`). A property that carries it says the
    // value is a password. That stands in place of whatever format the
    // scalar states, exactly as an explicit `@format` does.
    isSecret(program, prop) ||
    getDoc(program, prop) !== undefined ||
    getSummary(program, prop) !== undefined ||
    getExamples(program, prop).length > 0
  );
}

export function buildScalarSchema(
  program: Program,
  declarations: DeclarationRegistry,
  diagnostics: SchemaDiagnostics,
  scalar: Scalar,
): SchemaObject | ReferenceObject {
  // TypeSpec's own built-in scalars, such as `string` and `int32`, carry
  // their own standard-library doc comments. For example, `string` has "A
  // sequence of textual characters." Surfacing those on every plain
  // `string`/`int32` field would flood the output. So only a
  // user-declared scalar's own documentation is applied here.
  // `buildScalarShapeWithDocs` walks the whole `baseScalar` chain.
  // This keeps documentation on an intermediate or base user scalar from
  // being lost when the use site is derived through more than one level.
  // For example, `scalar WorkEmail extends Email;` where only `Email`
  // itself carries `@doc`/`@summary`/`@example`.
  // A user-declared scalar is a declaration the author named, so it earns
  // a `components.schemas` entry and every use site writes a reference.
  // This is the rule every other named declaration already follows, and
  // the one `@typespec/openapi3` follows for a scalar
  // (`schema-emitter.ts`, `scalarDeclaration`).
  //
  // A built-in stays inline. `string` has no name of the author's own, and
  // a component per built-in would be a component per primitive.
  if (isBuiltinScalar(scalar)) {
    return buildScalarShapeWithDocs(program, diagnostics, scalar);
  }
  return declarations.register(scalar, () =>
    buildScalarShapeWithDocs(program, diagnostics, scalar),
  );
}

/**
 * Builds the `type`/`format` shape for `scalar`, merged with
 * documentation collected along the entire `baseScalar` chain.
 * The base's own docs are applied first. Then each more-derived level's
 * own `@summary`/`@doc`/`@example` overrides them. `withDocs`'s
 * object-spread semantics already give the more specific fields priority
 * when merged last.
 * Built-in scalars never contribute documentation, only the shape. See
 * `isBuiltinScalar` at the `buildScalarSchema` call site's doc comment.
 * The walk bottoms out at the first built-in ancestor found, or at the
 * unconstrained `{}` shape for an unmapped root scalar. It then merges
 * each user-declared level's docs back on the way up.
 * `withPropertyDocs` on the use site can still override with the
 * property's own documentation afterward.
 */
export function buildScalarShapeWithDocs(
  program: Program,
  diagnostics: SchemaDiagnostics,
  scalar: Scalar,
): SchemaObject {
  if (isBuiltinScalar(scalar)) {
    const shape = Object.hasOwn(SCALAR_SCHEMAS, scalar.name)
      ? { ...SCALAR_SCHEMAS[scalar.name] }
      : {};
    // Built-ins never contribute *documentation* (see this function's own
    // doc comment). But an augment decorator, such as
    // `@@minLength(TypeSpec.string, 3);`, is the only legal way to apply
    // a 2.8 validation decorator to a built-in scalar. It is real user
    // intent, not library noise. So it must still be read back here,
    // rather than silently discarded.
    // `@@encode` reaches a built-in the same way, and changes the very
    // `type`/`format` this shape is made of, so it is applied first. An
    // explicit `@format` merged in afterwards still wins over the format
    // the encoding resolved to.
    return {
      ...applyEncoding(program, scalar, shape, diagnostics),
      ...buildValidationKeywords(program, scalar, diagnostics),
    };
  }
  // This is a derived, user-declared scalar. Start from its base
  // scalar's shape, recursing all the way to a built-in ancestor, or to
  // `{}` for an unmapped root scalar. Then merge this level's own
  // documentation on top.
  //
  // A validation keyword this level re-declares that the base already
  // baked in must NOT simply replace the base's value the way plain
  // object-spread would. For example, `@minLength(2) scalar Loose
  // extends Tight;` where `Tight` already has `@minLength(5)`. Two
  // constraints on the same value form a JSON Schema intersection; both
  // must hold. This is the same as the property-vs-scalar collision
  // `withPropertyDocs` guards against. Otherwise, a more-derived scalar
  // could silently erase a stricter ancestor constraint with no
  // diagnostic.
  // On collision, `base` is wrapped whole in `allOf`, the same wrap
  // `withPropertyDocs` uses, so both levels' keywords hold
  // simultaneously. Otherwise, keywords are merged in directly as before.
  // This level's own `@encode` changes the `type`/`format` it inherited
  // from the base. It is applied before `withDocs`, so an explicit
  // `@format` on this same scalar still wins over the encoding's format.
  const base = applyEncoding(
    program,
    scalar,
    scalar.baseScalar ? buildScalarShapeWithDocs(program, diagnostics, scalar.baseScalar) : {},
    diagnostics,
  );
  return withDocs(program, scalar, base, diagnostics);
}
