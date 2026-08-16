import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { rawSchemaSlot, RawSchemaState } from "./raw-schema.js";

const rawPayloadStateKey = Symbol.for("tsp-asyncapi.rawPayload");
const rawPayloadAppliedKey = Symbol.for("tsp-asyncapi.rawPayload.applied");

const slot = rawSchemaSlot(
  rawPayloadStateKey,
  rawPayloadAppliedKey,
  "duplicate-raw-payload-decorator",
);

/**
 * Describes the payload of a message with a schema of another format.
 *
 * Use this when the payload is defined in Avro, Protobuf, or another schema
 * language. AsyncAPI calls the result a Multi Format Schema Object. The
 * emitter writes `schemaFormat` and `schema` into the message, and it emits
 * `schema` exactly as written. It never reads inside the schema, so it cannot
 * check the schema against the format.
 *
 * The model this decorator marks describes nothing that reaches this message.
 * It stops being a root of the schema walk. So it claims no
 * `components.schemas` key of its own, and neither do the models it refers
 * to. It is not exempt from that walk. Another message that reaches this
 * model, or one it refers to, still collects it, and its properties are then
 * emitted. The model is a carrier for the message decorators. So the
 * recommended form is a model with an empty body.
 *
 * The raw payload is written into the message itself, never into
 * `components.schemas`. So two messages cannot share one raw schema through a
 * `$ref` yet.
 *
 * Do not mix this with a field-level `@header` on the same message. A lifted
 * field leaves the payload schema, and the emitter cannot take a field out of
 * a schema it does not read. The emitter reports `raw-payload-lifted-header`
 * and emits both halves. Describe the headers with `@headers` or
 * `@rawHeaders` instead. Both of those combine with this decorator, and
 * neither is reported.
 *
 * Apply this decorator only once per model. A second application is an error,
 * the same rule `@message` and `@headers` follow. A message carries one
 * payload, so the user has no way to tell which application won.
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
 * @rawPayload(
 *   "application/vnd.apache.avro;version=1.9.0",
 *   #{ type: "record", name: "Order", fields: #[#{ name: "id", type: "string" }] }
 * )
 * model OrderCreated {}
 * ```
 *
 * @public
 */
export function $rawPayload(
  context: DecoratorContext,
  target: Model,
  schemaFormat: string,
  schema: unknown,
) {
  slot.apply(context, target, schemaFormat, schema);
}

/**
 * Reads back the raw payload schema that `@rawPayload` records.
 *
 * @param program - The program to read the state from
 * @param target - The model the decorator was applied to
 * @returns The recorded format and schema, or `undefined` when the decorator
 * was never applied with a valid value
 *
 * @public
 */
export function getRawPayload(program: Program, target: Model): RawSchemaState | undefined {
  return slot.read(program, target);
}
