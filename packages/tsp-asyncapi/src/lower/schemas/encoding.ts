/**
 * How `@encode` reaches a schema's `type` and `format`.
 *
 * TypeSpec separates what a value *is* from how it travels on the wire. The
 * type says a property holds a moment in time. `@encode` says that moment
 * arrives as an integer count of seconds. Both have to reach the schema, or
 * the document describes a shape the producer never sends.
 */

import { ModelProperty, Program, Scalar, getEncode } from "@typespec/compiler";
import { SchemaObject } from "../../types/index.js";
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
 * Returns the scalar whose natural shape an encoding is resolved against.
 *
 * For a scalar declaration that is the scalar itself. For a property it is
 * the property's declared type, when that type is a scalar.
 * A property of any other type yields `undefined`. `@encode` only legally
 * targets a scalar-typed property, so this is the "cannot happen" case rather
 * than a shape worth guessing at.
 */
function declaredScalarOf(target: Scalar | ModelProperty): Scalar | undefined {
  if (target.kind === "Scalar") return target;
  return target.type.kind === "Scalar" ? target.type : undefined;
}

/**
 * Applies `target`'s own `@encode`, if it has one, to an already-built schema.
 *
 * The encode target's `type` replaces the declared type's: a `utcDateTime`
 * encoded as `unixTimestamp` into an `int32` is an integer on the wire, not a
 * string. `items` goes with it whenever the new type is not an array, because
 * it described an element shape that no longer travels.
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

  const encoded: SchemaObject = { ...schema };
  const targetShape = naturalScalarShape(encodeData.type);
  encoded.type = targetShape.type;
  if (targetShape.type !== "array") {
    delete encoded.items;
  }
  const declared = declaredScalarOf(target);
  const naturalFormat = declared !== undefined ? naturalScalarShape(declared).format : undefined;
  const format = mergeFormatAndEncoding(naturalFormat, encodeData.encoding, targetShape.format);
  if (format !== undefined) {
    encoded.format = format;
  } else {
    delete encoded.format;
  }
  return encoded;
}
