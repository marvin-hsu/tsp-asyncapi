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
 * Maps built-in scalars and intrinsics to their AsyncAPI shape, and builds
 * the shape for enums, enum members, and user-declared scalars.
 *
 * A built-in scalar is looked up by name. A user-declared scalar walks its
 * `baseScalar` chain to find one.
 */

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
 * Returns true when `scalar` is one of TypeSpec's own built-in scalars,
 * declared in the global `TypeSpec` namespace.
 *
 * A user-declared scalar can share a name with a built-in without being one,
 * for example `namespace MyLib { scalar duration extends int32; }`. Only a
 * built-in should be looked up directly in `SCALAR_SCHEMAS` by name; a user
 * scalar must walk `baseScalar` instead.
 */
export function isBuiltinScalar(scalar: Scalar): boolean {
  return isGlobalTypeSpecNamespace(scalar.namespace);
}

/**
 * Returns true when `model` is the built-in `Array`/`Record` template: an
 * anonymous instantiation at a use site, such as `string[]` or
 * `Record<int32>`.
 *
 * This excludes a named alias declared with `is`, such as
 * `model Names is string[];`. Only the anonymous use site stays inlined; a
 * named alias is a real declaration and registers like any other named
 * model. TypeSpec's built-in templates live in the global `TypeSpec`
 * namespace; a user-declared alias never does.
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
  // TypeSpec's built-in scalars carry their own standard-library doc
  // comments, such as "A sequence of textual characters" for `string`.
  // Surfacing those on every plain `string`/`int32` field would flood the
  // output, so only a user-declared scalar's own documentation is applied.
  // A built-in has no author-given name, so it stays inline rather than
  // becoming a `components.schemas` entry per primitive. A user-declared
  // scalar is a named declaration, so it registers like any other one,
  // matching how `@typespec/openapi3` treats a scalar declaration.
  if (isBuiltinScalar(scalar)) {
    return buildScalarShapeWithDocs(program, diagnostics, scalar);
  }
  return declarations.register(scalar, () =>
    buildScalarShapeWithDocs(program, diagnostics, scalar),
  );
}

/**
 * Builds the `type`/`format` shape for `scalar`, merged with documentation
 * collected along the entire `baseScalar` chain.
 *
 * The walk bottoms out at the first built-in ancestor, or at the
 * unconstrained `{}` shape for an unmapped root scalar. Each user-declared
 * level's own docs are then merged back on top, most specific last, so a
 * more-derived `@doc`/`@summary`/`@example` wins. Built-ins contribute no
 * documentation, only the shape. `withPropertyDocs` on the use site can
 * still override the result with the property's own documentation.
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
    // Built-ins contribute no documentation, but an augment decorator such
    // as `@@minLength(TypeSpec.string, 3);` is the only legal way to put a
    // validation decorator on a built-in scalar, and it is real user
    // intent. It must still be read back here. `@@encode` reaches a
    // built-in the same way and changes the `type`/`format` itself, so it
    // is applied first; an explicit `@format` merged in after still wins.
    return {
      ...applyEncoding(program, scalar, shape, diagnostics),
      ...buildValidationKeywords(program, scalar, diagnostics),
    };
  }
  // A derived, user-declared scalar: recurse to the base scalar's shape,
  // then merge this level's own documentation on top.
  //
  // A validation keyword this level re-declares must not simply replace
  // the base's value. `@minLength(2) scalar Loose extends Tight;`, where
  // `Tight` already has `@minLength(5)`, forms a JSON Schema intersection;
  // both constraints must hold, or a more-derived scalar could silently
  // erase a stricter ancestor constraint. `withDocs` wraps `base` whole in
  // `allOf` on such a collision, the same guard `withPropertyDocs` uses,
  // so both levels' keywords hold at once.
  // This level's own `@encode` changes the inherited `type`/`format`, and
  // is applied before `withDocs`, so an explicit `@format` here still wins
  // over the encoding's format.
  const base = applyEncoding(
    program,
    scalar,
    scalar.baseScalar ? buildScalarShapeWithDocs(program, diagnostics, scalar.baseScalar) : {},
    diagnostics,
  );
  return withDocs(program, scalar, base, diagnostics);
}
