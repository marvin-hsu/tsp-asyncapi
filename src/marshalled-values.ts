/**
 * Turning a marshalled decorator argument into plain JSON.
 *
 * The compiler marshals a `valueof` argument before a decorator runs. The
 * result is plain JavaScript for a string, a number and a boolean. It is not
 * plain JavaScript for every scalar: a `utcDateTime` or a `decimal` arrives
 * as the compiler's own value object, and writing that object into the
 * document would emit the compiler's internals.
 *
 * The function below finishes the job. It is a port of the
 * `convertRemainingValuesToExtensions` workaround in
 * `@typespec/json-schema`, which its `@extension` decorator uses for the same
 * reason. The workaround exists because a decorator cannot yet ask the
 * compiler to skip marshalling and call `serializeValueAsJson` itself. See
 * microsoft/typespec#3570.
 *
 * Two layers ask this question, so the answer sits here rather than under
 * either of them. Every binding decorator uses it: the generic `@binding`
 * on the whole config, and each protocol decorator on the fields it does not
 * read itself. The schema builder uses it on every `@jsonSchemaExtension`
 * value, which is marshalled the same way and reaches the document raw.
 */

import { Program, Value, serializeValueAsJson } from "@typespec/compiler";

/**
 * Tells whether a marshalled object is still a TypeSpec value.
 *
 * The compiler tags every value object with `entityKind`, so the tag is the
 * test. A plain object the marshaller already produced carries no such field.
 */
function isTypeSpecValue(value: object): value is Value {
  return "entityKind" in value && value.entityKind === "Value";
}

/**
 * Converts one marshalled decorator argument into plain JSON.
 *
 * A string, a number and a boolean pass through. An array is converted
 * element by element. An object is converted field by field.
 *
 * A field is dropped in two cases. The first is a field the author left out.
 * The second is a field the serializer cannot represent. Both would otherwise
 * write a key whose value is `undefined`, which no JSON document can hold.
 * The test runs on the converted value, because the serializer is what
 * produces the second case.
 *
 * A value the compiler did not flatten is serialized against its own type.
 * That is what turns a `utcDateTime` into an ISO string.
 *
 * @param program - The program the value belongs to
 * @param value - One marshalled decorator argument, or a part of one
 * @returns The same data as plain JSON, or `undefined` when the serializer
 * cannot represent the value
 * @internal
 */
export function toPlainValue(program: Program, value: unknown): unknown {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "object": {
      if (value === null) return null;
      if (Array.isArray(value)) {
        return value.map((element) => toPlainValue(program, element));
      }
      if (isTypeSpecValue(value)) {
        return serializeValueAsJson(program, value, value.type);
      }
      const result: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(value)) {
        const plain = toPlainValue(program, field);
        if (plain === undefined) continue;
        result[key] = plain;
      }
      return result;
    }
    default:
      return value;
  }
}

/**
 * Tells whether a converted value is a JSON object.
 *
 * Every member of a Bindings Object is an object. An array and a scalar are
 * both rejected, so the test cannot be a plain `typeof` check.
 *
 * @param value - A value that already went through `toPlainValue`
 * @returns Whether the value can be written as a Bindings Object member
 * @internal
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
