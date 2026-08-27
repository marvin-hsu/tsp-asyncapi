/**
 * How `@encode` reaches a schema's `type` and `format`.
 *
 * TypeSpec separates what a value *is* from how it travels on the wire. The
 * type says a property holds a moment in time. `@encode` says that moment
 * arrives as an integer count of seconds. Both have to reach the schema, or
 * the document describes a shape the producer never sends.
 */

import {
  EncodeData,
  ModelProperty,
  Program,
  Scalar,
  Type,
  Union,
  getEncode,
} from "@typespec/compiler";
import { ReferenceObject, SchemaObject } from "../../types/index.js";
import { SCHEMA_FORMAT } from "tsp-asyncapi-core";
import { SCALAR_SCHEMAS, isBuiltinScalar } from "./scalars.js";

/**
 * The `format` an encoded value ends up with.
 *
 * `format` is the declared type's own format, before any encoding. Resolving
 * against that, rather than against a format an earlier encoding already
 * produced, is what lets an encoding be overridden: a scalar encoded as
 * `unixTimestamp` and then re-encoded as `rfc7231` at the use site still
 * describes a date, so it has to resolve to `http-date` and not to the bare
 * encoding name.
 *
 * Date-time and duration each have a named JSON Schema format per encoding,
 * so they need their own rules. Everything else falls through to the encode
 * target's format, then the encoding name, then the declared format.
 *
 * These rules match `@typespec/openapi3`'s `mergeFormatAndEncoding`. Both
 * emitters write JSON Schema, so a value encoded one way has to be described
 * the same way by both.
 */
function mergeFormatAndEncoding(
  format: string | undefined,
  encoding: string | undefined,
  encodeAsFormat: string | undefined,
): string | undefined {
  switch (format) {
    case undefined:
      return encodeAsFormat ?? encoding;
    case SCHEMA_FORMAT.dateTime:
      switch (encoding) {
        case "rfc3339":
          return SCHEMA_FORMAT.dateTime;
        case "unixTimestamp":
          return SCHEMA_FORMAT.unixTime;
        case "rfc7231":
          return SCHEMA_FORMAT.httpDate;
        default:
          return encoding;
      }
    case SCHEMA_FORMAT.duration:
      // ISO 8601 is how an un-encoded duration already travels, so it keeps
      // the `duration` format. Any other encoding, such as a seconds count,
      // has no format of its own and takes the encode target's.
      return encoding === "ISO8601" ? SCHEMA_FORMAT.duration : (encodeAsFormat ?? encoding);
    default:
      return encodeAsFormat ?? encoding ?? format;
  }
}

/**
 * Returns a scalar's shape before any `@encode` is taken into account.
 *
 * This is the same walk `buildScalarSchemaShapeWithDocs` performs, minus the
 * documentation and the validation keywords. A built-in is looked up by its
 * own name and never falls through to its base, so a user scalar that happens
 * to share a built-in's name cannot borrow that mapping. A user-declared
 * scalar walks its `baseScalar` chain until a built-in is found.
 * A chain that bottoms out in no built-in yields `{}`, the unconstrained
 * shape an unmapped scalar produces everywhere else.
 */
function naturalScalarShape(scalar: Scalar): SchemaObject {
  if (isBuiltinScalar(scalar)) {
    return Object.hasOwn(SCALAR_SCHEMAS, scalar.name) ? { ...SCALAR_SCHEMAS[scalar.name] } : {};
  }
  return scalar.baseScalar ? naturalScalarShape(scalar.baseScalar) : {};
}

/**
 * Returns the type the encoding is resolved against.
 *
 * For a scalar declaration that is the scalar itself. For a property it is
 * the property's declared type.
 */
function declaredTypeOf(target: Scalar | ModelProperty): Type {
  return target.kind === "Scalar" ? target : target.type;
}

/**
 * Writes one encoding onto the shape of a single value.
 *
 * The encode target's `type` replaces the declared type's: a `utcDateTime`
 * encoded as `unixTimestamp` into an `int32` is an integer on the wire, not a
 * string. `items` goes with it whenever the new type is not an array, because
 * it described an element shape that no longer travels.
 *
 * `declared` is the scalar the encoded value was declared as, which decides
 * the format the encoding resolves to. A value declared as anything else has
 * no natural format to resolve against, so it takes the encoding's own.
 */
function encodeShape(
  schema: SchemaObject,
  encodeData: EncodeData,
  declared: Scalar | undefined,
): SchemaObject {
  const encoded: SchemaObject = { ...schema };
  const targetShape = naturalScalarShape(encodeData.type);
  encoded.type = targetShape.type;
  if (targetShape.type !== "array") {
    delete encoded.items;
  }
  const naturalFormat = declared !== undefined ? naturalScalarShape(declared).format : undefined;
  const format = mergeFormatAndEncoding(naturalFormat, encodeData.encoding, targetShape.format);
  if (format !== undefined) {
    encoded.format = format;
  } else {
    delete encoded.format;
  }
  return encoded;
}

/**
 * The declared scalars each named encoding describes.
 *
 * These rows repeat the rules `validateEncodeData` in `@typespec/compiler`
 * applies. The compiler accepts an encoding on a union when any one variant
 * is a legal target. It does not record which variant that was. So the rule
 * is repeated here to ask each variant the same question.
 *
 * An encoding this table does not name is a custom one. The compiler
 * constrains neither its target nor its encode type, so there is no rule
 * here to select a variant by.
 */
const ENCODING_TARGETS: Record<string, readonly string[]> = {
  rfc3339: ["utcDateTime", "offsetDateTime"],
  rfc7231: ["utcDateTime", "offsetDateTime"],
  unixTimestamp: ["utcDateTime"],
  seconds: ["duration"],
  milliseconds: ["duration"],
  base64: ["bytes"],
  base64url: ["bytes"],
};

/** The schema types `@encode(string)` accepts, being numeric and boolean. */
const PLAIN_ENCODE_TYPES: readonly string[] = ["integer", "number", "boolean"];

/**
 * Returns the name of the built-in `scalar` is declared as.
 *
 * A built-in answers with its own name. A user scalar walks its `baseScalar`
 * chain to the first built-in. A chain that reaches no built-in answers
 * `undefined`, so no encoding rule can select it.
 */
function builtinBaseName(scalar: Scalar): string | undefined {
  if (isBuiltinScalar(scalar)) {
    return scalar.name;
  }
  return scalar.baseScalar ? builtinBaseName(scalar.baseScalar) : undefined;
}

/**
 * Returns true when `encodeData` describes a value declared as `variant`.
 *
 * `@encode(string)` carries no encoding name. It converts a numeric or a
 * boolean to text, so those are the shapes it describes.
 *
 * A custom encoding has no rule to select a variant by, so every scalar
 * variant is treated as one it describes. That is what this function did for
 * every encoding before, and it keeps a custom encoding reaching the
 * document.
 */
function encodingDescribes(encodeData: EncodeData, variant: Scalar): boolean {
  const { encoding } = encodeData;
  if (encoding === undefined) {
    const type = naturalScalarShape(variant).type;
    return type !== undefined && PLAIN_ENCODE_TYPES.includes(type);
  }
  if (!Object.hasOwn(ENCODING_TARGETS, encoding)) {
    return true;
  }
  const builtin = builtinBaseName(variant);
  return builtin !== undefined && ENCODING_TARGETS[encoding].includes(builtin);
}

/** The keywords a union's variant schemas are written under. */
const UNION_KEYWORDS = ["anyOf", "oneOf"] as const;

/**
 * Applies an encoding to a union, variant by variant.
 *
 * A nullable value is a union, and `@encode` on one describes a single
 * variant. `utcDateTime | null` encoded as a `unixTimestamp` arrives as
 * either an integer or a null, never as an integer that is also a string.
 * Writing the encoded `type` onto the union itself says all three at once,
 * and no value satisfies that.
 *
 * So each branch is encoded on its own, and only a branch whose variant is a
 * scalar is touched. A `null` variant, or a model variant, carries no encoded
 * value and is left as it was.
 *
 * A scalar variant the encoding says nothing about is left as it was too.
 * The compiler accepts `@encode("unixTimestamp", int32)` on
 * `utcDateTime | string` because one variant is a moment in time. The
 * `string` variant is not one. Describing it as an integer as well would
 * make every legal string payload fail its own schema. See
 * `encodingDescribes` for the rule that selects a variant.
 *
 * A branch that is a reference is replaced rather than wrapped. The component
 * it points at describes the un-encoded scalar, and `allOf` would then ask
 * for a string and an integer at once. This mirrors the plain scalar case,
 * where a property carrying `@encode` writes the scalar in place instead of
 * referring to it.
 *
 * A schema whose branches do not line up with the union's variants is
 * returned untouched. That is a string-literal union collapsed to one `enum`,
 * or a `@discriminated` envelope: neither has a branch per variant to encode,
 * and the compiler's own `invalid-encode` already rejects an encoding on
 * either.
 */
function encodeUnion(union: Union, schema: SchemaObject, encodeData: EncodeData): SchemaObject {
  const variants = [...union.variants.values()];
  for (const keyword of UNION_KEYWORDS) {
    const branches = schema[keyword];
    if (branches?.length !== variants.length) {
      continue;
    }
    const encoded = branches.map((branch: SchemaObject | ReferenceObject, index: number) => {
      const variant = variants[index].type;
      if (variant.kind !== "Scalar" || !encodingDescribes(encodeData, variant)) {
        return branch;
      }
      return encodeShape("$ref" in branch ? {} : branch, encodeData, variant);
    });
    return { ...schema, [keyword]: encoded };
  }
  return schema;
}

/**
 * Applies `target`'s own `@encode`, if it has one, to an already-built schema.
 *
 * A scalar-typed target is encoded in place. A union-typed one is encoded
 * variant by variant; see `encodeUnion`.
 *
 * A target with no `@encode` is returned untouched, so callers can apply this
 * unconditionally.
 *
 * @param program - The program the target belongs to
 * @param target - The scalar declaration or property whose `@encode` is read
 * @param schema - The schema already built from the declared type
 * @returns The schema with the encoding applied
 * @internal
 */
export function applyEncoding(
  program: Program,
  target: Scalar | ModelProperty,
  schema: SchemaObject,
): SchemaObject {
  const encodeData = getEncode(program, target);
  if (encodeData === undefined) return schema;

  const declared = declaredTypeOf(target);
  if (declared.kind === "Union") {
    return encodeUnion(declared, schema, encodeData);
  }
  return encodeShape(schema, encodeData, declared.kind === "Scalar" ? declared : undefined);
}
