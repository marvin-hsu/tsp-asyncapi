import { Model, ModelProperty, Program } from "@typespec/compiler";
import { MultiFormatSchemaObject, ReferenceObject, SchemaObject } from "../../types/index.js";
import { getRawPayload, RawSchemaState } from "../../decorators/index.js";
import { SchemaBuilder } from "../schemas/builder.js";
// This import is type-only on purpose. The headers builder imports
// `buildRawSchema` from this file at run time, and a type import leaves no
// run-time edge back, so the two modules never form a cycle.
import type { MessageHeaderPlan } from "./headers.js";

/**
 * Builds the Multi Format Schema Object of one raw schema.
 *
 * The state a decorator records is the object itself, so this copies it. The
 * copy keeps the emitted document independent of the state map. `payload` and
 * `headers` both accept the object, and both slots go through this function.
 * So the two slots cannot drift apart.
 *
 * @param state - The format and schema a raw schema decorator recorded
 * @returns The Multi Format Schema Object to write into the message
 */
export function buildRawSchema(state: RawSchemaState): MultiFormatSchemaObject {
  return { ...state };
}

/**
 * The fields this message lifted out of its own payload.
 *
 * The plan records a header source per message, so the answer is local to
 * one message rather than shared across every message that reaches the same
 * model. A message that lifts nothing gets an empty set, and its payload
 * stays a reference to the model's own component. A message whose headers
 * come from `@headers` or `@rawHeaders` lifts no field, so its source carries
 * an empty field list.
 */
function liftedOf(plan: MessageHeaderPlan, model: Model): ReadonlySet<ModelProperty> {
  return new Set(plan.sources.get(model)?.fields ?? []);
}

/**
 * Builds the `payload` of one Message Object.
 *
 * A message with `@rawPayload` carries the schema the author wrote, in the
 * format the author named. Nothing is built from the model in that case. The
 * model claims no `components.schemas` key of its own, and neither do the
 * models it refers to. A raw message only stops being a root of the schema
 * walk. It is not exempt from that walk. Another message that reaches the raw
 * model itself, or a model it refers to, still collects it, and the collected
 * model gets its ordinary JSON Schema entry.
 *
 * The raw schema is written into the message itself. It is never hoisted into
 * `components.schemas`. The schema layer keys and deduplicates a component by
 * the model it was built from, and a raw schema was built from no model.
 * Registering the message model as the owner of such a key would report a key
 * clash against a schema that was never built.
 *
 * Inlining keeps the emitter from writing a `$ref` whose two ends carry
 * different `schemaFormat` values, which the specification forbids. It does
 * not settle that rule on its own. The author can write such a `$ref` inside
 * the raw schema, and the emitter copies the schema verbatim. The raw schema
 * decorator reports that case. See `raw-schema-local-ref`.
 *
 * Every other message defers to the schema layer, which builds the payload
 * from the model and omits the fields the message lifted into `headers`.
 *
 * @param program - The program the message belongs to
 * @param schemas - The schema builder that owns `components.schemas`
 * @param headerPlan - The header source of every message
 * @param model - The message model
 * @returns The value of the message's `payload` field
 */
export function buildMessagePayload(
  program: Program,
  schemas: SchemaBuilder,
  headerPlan: MessageHeaderPlan,
  model: Model,
): MultiFormatSchemaObject | SchemaObject | ReferenceObject {
  const raw = getRawPayload(program, model);
  if (raw !== undefined) {
    return buildRawSchema(raw);
  }
  return schemas.buildPayloadDeclaration(model, liftedOf(headerPlan, model));
}
