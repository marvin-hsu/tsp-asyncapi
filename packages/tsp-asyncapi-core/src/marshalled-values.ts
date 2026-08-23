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
 * Marks a value the serializer cannot represent.
 *
 * A failure cannot be reported as `undefined` inside the recursion. An
 * absent member of an object value arrives as `undefined` too, and those two
 * cases need opposite answers: an absent member is dropped, a failed one
 * fails the value that holds it.
 */
const UNREPRESENTABLE = Symbol("unrepresentable");

/**
 * Converts every element of an array value.
 *
 * One failed element fails the array. Dropping it would leave a hole, and a
 * hole reaches the writer as `null`.
 */
function convertArray(program: Program, value: readonly unknown[]): unknown {
  const elements: unknown[] = [];
  for (const element of value) {
    const plain = convert(program, element);
    if (plain === UNREPRESENTABLE) return UNREPRESENTABLE;
    elements.push(plain);
  }
  return elements;
}

/**
 * Converts every member of an object value.
 *
 * A member the author left out is dropped. That is the one `undefined` here
 * that is not a failure, so it is tested before the conversion runs.
 *
 * One failed member fails the object. A truncated object would claim the
 * author wrote fewer members than they did.
 */
function convertObject(program: Program, value: object): unknown {
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined) continue;
    const plain = convert(program, field);
    if (plain === UNREPRESENTABLE) return UNREPRESENTABLE;
    result[key] = plain;
  }
  return result;
}

/**
 * Converts one marshalled value, or reports that it cannot be converted.
 *
 * A string, a number and a boolean pass through. A value the compiler did
 * not flatten is serialized against its own type. That is what turns a
 * `utcDateTime` into an ISO string.
 */
function convert(program: Program, value: unknown): unknown {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "object": {
      if (value === null) return null;
      if (Array.isArray(value)) return convertArray(program, value);
      if (!isTypeSpecValue(value)) return convertObject(program, value);
      const plain = serializeValueAsJson(program, value, value.type);
      return plain === undefined ? UNREPRESENTABLE : plain;
    }
    default:
      return value === undefined ? UNREPRESENTABLE : value;
  }
}

/**
 * Converts one marshalled decorator argument into plain JSON.
 *
 * The whole argument is rejected when any part of it cannot be represented.
 * So every caller reports one problem about the argument it was given, and
 * no partial value reaches the document.
 *
 * A member the author named `__proto__` never arrives. The marshaller assigns
 * each member of an object value in turn, and that assignment writes the
 * prototype rather than the member. So the loop above reads an object that
 * already lost the pair, and `Object.entries` skips whatever the prototype
 * now holds. Nothing here can recover the name.
 *
 * @param program - The program the value belongs to
 * @param value - One marshalled decorator argument
 * @returns The same data as plain JSON, or `undefined` when the serializer
 * cannot represent some part of the value
 * @internal
 */
export function toPlainValue(program: Program, value: unknown): unknown {
  const plain = convert(program, value);
  return plain === UNREPRESENTABLE ? undefined : plain;
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
