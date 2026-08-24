/**
 * The lower half of the messages.
 *
 * It turns resolved nodes into the `components.messages` map. The one thing
 * it still needs beyond the nodes is the schema builder: a payload and a
 * header schema are both expansions of the type graph, and the plan keeps
 * that in this half.
 *
 * Everything a message is made of besides those two schemas was settled in
 * resolve, keys included.
 */

import { Program } from "@typespec/compiler";
import type {
  MessageHeadersNode,
  MessageNode,
  MessagePayloadNode,
} from "tsp-asyncapi-core/unstable";
import { present, text, reportDiagnostic } from "tsp-asyncapi-core";
import { SchemaBuilder } from "./schemas.js";
import {
  CorrelationIdObject,
  MessageObject,
  MultiFormatSchemaObject,
  ReferenceObject,
  SchemaObject,
} from "../types/index.js";
import { lowerBindings } from "./bindings.js";
import type { MessagePromotions } from "./components/raw-schemas.js";
import { componentRef, refFor } from "./json-pointer.js";

/** Builds the `headers` of one Message Object. */
function lowerHeaders(
  schemas: SchemaBuilder,
  promoted: MessagePromotions,
  node: MessageHeadersNode,
): MultiFormatSchemaObject | SchemaObject | ReferenceObject | undefined {
  switch (node.kind) {
    case "none":
      return undefined;
    case "raw": {
      const key = promoted.rawSchemas.keyFor("headers", node.schema);
      return key === undefined ? node.schema : refFor(key);
    }
    case "model":
      return schemas.buildDeclarationRef(node.model);
    case "fields":
      return schemas.buildPropertiesSchema(node.fields);
  }
}

/** Builds the `payload` of one Message Object. */
function lowerPayload(
  schemas: SchemaBuilder,
  promoted: MessagePromotions,
  node: MessagePayloadNode,
): MultiFormatSchemaObject | SchemaObject | ReferenceObject {
  // A message with a raw payload carries the schema the author wrote, in the
  // format the author named. Nothing is built from the model, so that model
  // claims no `components.schemas` key and neither do the models it names.
  //
  // Two messages carrying the same schema share one component. One message
  // carrying it alone keeps it here, because a component would add a `$ref`
  // hop and save nothing.
  if (node.kind !== "raw") return schemas.buildPayloadDeclaration(node.model, node.lifted);
  const key = promoted.rawSchemas.keyFor("payload", node.schema);
  return key === undefined ? node.schema : refFor(key);
}

/**
 * Builds the `correlationId` of one Message Object.
 *
 * A Correlation ID Object has no name of its own, so two messages share one
 * only when they state the same location. One message stating it alone keeps
 * it in place.
 */
function lowerCorrelationId(
  promoted: MessagePromotions,
  node: CorrelationIdObject | undefined,
): CorrelationIdObject | ReferenceObject | undefined {
  if (node === undefined) return undefined;
  const key = promoted.correlationIds.keyFor(node);
  return key === undefined ? node : { $ref: componentRef("correlationIds", key) };
}

/**
 * Builds one Message Object.
 *
 * The field order follows the Message Object table of the specification.
 */
function lowerMessage(
  schemas: SchemaBuilder,
  promoted: MessagePromotions,
  node: MessageNode,
): MessageObject {
  return {
    name: node.key,
    ...text("title", node.title),
    ...text("description", node.description),
    ...text("contentType", node.contentType),
    ...present("headers", lowerHeaders(schemas, promoted, node.headers)),
    payload: lowerPayload(schemas, promoted, node.payload),
    ...present("correlationId", lowerCorrelationId(promoted, node.correlationId)),
    ...present("bindings", lowerBindings(node.bindings)),
    ...present("tags", node.tags.length > 0 ? structuredClone([...node.tags]) : undefined),
    ...present("externalDocs", node.externalDocs ? { ...node.externalDocs } : undefined),
    ...present("examples", node.examples.length > 0 ? [...node.examples] : undefined),
    // The `x-` fields go last. They cannot collide with a specification
    // field, so their place is after every one of them.
    ...structuredClone(node.extensions),
  };
}

/**
 * Builds the `components.messages` map from resolved nodes.
 *
 * Building the messages is also what drives schema collection.
 * `SchemaBuilder` follows a payload into the models it names, so it ends up
 * holding exactly the models the messages reach and nothing else. A model no
 * message reaches gets no `components.schemas` entry.
 *
 * @param schemas - The schema builder the payloads expand into
 * @param nodes - The resolved messages, in source order
 * @returns The `components.messages` map, or `undefined` when there is no
 * message. An empty map is never emitted.
 * @internal
 */
export function lowerMessages(
  schemas: SchemaBuilder,
  promoted: MessagePromotions,
  nodes: readonly MessageNode[],
): Record<string, MessageObject> | undefined {
  if (nodes.length === 0) return undefined;
  // A null prototype keeps a key such as `__proto__` an ordinary own
  // property. A plain object literal would run the inherited setter instead,
  // dropping the message and replacing the map's prototype. This matches
  // `SchemaBuilder.getSchemas`.
  const messages = Object.create(null) as Record<string, MessageObject>;
  for (const node of nodes) {
    messages[node.key] = lowerMessage(schemas, promoted, node);
  }
  return messages;
}

/**
 * Reports every `components.messages` key that is also the
 * `components.schemas` key of a different type.
 *
 * A message key drops the namespace prefix a schema key keeps. So
 * `@message("Sales.Ev")` on an unrelated model, or a `@message model Ev`
 * inside `namespace Sales` next to a global `model Ev`, produces a document
 * where `components.messages["Sales.Ev"]` describes something other than
 * `components.schemas["Sales.Ev"]`. No key actually collides, so
 * `duplicate-message-key` never fires and the output stays valid. It is only
 * misleading, so this is a warning.
 *
 * This has to run in the lower half, and it has to run last. A schema key
 * is claimed while the type graph is walked, and a discriminated subtype
 * claims its own only once the pending queue is drained. A check that read
 * the owner table any earlier would miss exactly the keys it exists to find.
 *
 * @param program - The program the messages belong to
 * @param schemas - The schema builder, after every key is claimed
 * @param nodes - The resolved messages
 * @internal
 */
export function reportShadowedSchemaKeys(
  program: Program,
  schemas: SchemaBuilder,
  nodes: readonly MessageNode[],
): void {
  // Every subtype has to have claimed its key before the owners are read.
  schemas.flushPendingSubtypes();
  for (const node of nodes) {
    const owner = schemas.schemaKeyOwner(node.key);
    if (owner === undefined || owner === node.target) continue;
    reportDiagnostic(program, {
      code: "message-key-shadows-schema-key",
      target: node.target,
      format: { name: node.key },
    });
  }
}
