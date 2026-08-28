import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { rawSchemaSlot, RawSchemaState } from "./raw-schema.js";

const rawHeadersStateKey = Symbol.for("tsp-asyncapi.rawHeaders");
const rawHeadersAppliedKey = Symbol.for("tsp-asyncapi.rawHeaders.applied");

const slot = rawSchemaSlot(
  rawHeadersStateKey,
  rawHeadersAppliedKey,
  "duplicate-raw-headers-decorator",
);

/**
 * Describes the headers of a message with a schema of another format.
 *
 * Use this when the headers are defined in Avro, Protobuf, or another schema
 * language. AsyncAPI calls the result a Multi Format Schema Object. The
 * emitter writes `schemaFormat` and `schema` into the message, and it emits
 * `schema` exactly as written. It never reads inside the schema, so it cannot
 * check the schema against the format.
 *
 * This is the third way to describe the headers of a message. The other two
 * are a field-level `@header` and a model given to `@headers`. A message uses
 * one of the three. Two sources for one headers object have no obvious
 * winner, so the emitter reports `duplicate-message-headers` and emits
 * neither.
 *
 * Apply this decorator only once per model. A second application is an error,
 * the same rule `@headers` follows. A message carries one headers schema, so
 * the user has no way to tell which application won.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param schemaFormat - The format of `schema`, such as
 * `application/vnd.apache.avro;version=1.9.0`
 * @param schema - The schema definition, emitted as written
 *
 * @example
 * ```typespec
 * @message
 * @rawHeaders(
 *   "application/vnd.apache.avro;version=1.9.0",
 *   #{ type: "record", name: "Meta", fields: #[#{ name: "traceId", type: "string" }] }
 * )
 * model OrderCreated {
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $rawHeaders(
  context: DecoratorContext,
  target: Model,
  schemaFormat: string,
  schema: unknown,
) {
  slot.apply(context, target, schemaFormat, schema);
}

/**
 * Reads back the raw headers schema that `@rawHeaders` records.
 *
 * @param program - The program to read the state from
 * @param target - The model the decorator was applied to
 *
 * @returns The recorded format and schema, or `undefined` when the decorator
 * was never applied with a valid value
 *
 * @public
 */
export function getRawHeaders(program: Program, target: Model): RawSchemaState | undefined {
  return slot.read(program, target);
}
