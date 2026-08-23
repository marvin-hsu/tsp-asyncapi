import { Model, Scalar, IntrinsicType, Enum, EnumMember, ModelProperty } from "@typespec/compiler";
import { SchemaObject } from "../../types/index.js";
import { JSON_SCHEMA_TYPE, SCHEMA_FORMAT, isGlobalTypeSpecNamespace } from "tsp-asyncapi-core";

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
