/**
 * The project half of the messages.
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
import type { MessageHeadersNode, MessageNode, MessagePayloadNode } from "../resolve/service.js";
import { present, text } from "../optional-fields.js";
import { SchemaBuilder } from "../builders/schemas/builder.js";
import { reportDiagnostic } from "../lib.js";
import { MessageObject, MultiFormatSchemaObject, ReferenceObject, SchemaObject } from "../types.js";
import { projectBindings } from "./bindings.js";

/** Builds the `headers` of one Message Object. */
function projectHeaders(
  schemas: SchemaBuilder,
  node: MessageHeadersNode,
): MultiFormatSchemaObject | SchemaObject | ReferenceObject | undefined {
  switch (node.kind) {
    case "none":
      return undefined;
    case "raw":
      return node.schema;
    case "model":
      return schemas.buildDeclarationRef(node.model);
    case "fields":
      return schemas.buildPropertiesSchema(node.fields);
  }
}

/** Builds the `payload` of one Message Object. */
function projectPayload(
  schemas: SchemaBuilder,
  node: MessagePayloadNode,
): MultiFormatSchemaObject | SchemaObject | ReferenceObject {
  // A message with a raw payload carries the schema the author wrote, in the
  // format the author named. Nothing is built from the model, so that model
  // claims no `components.schemas` key and neither do the models it names.
  return node.kind === "raw"
    ? node.schema
    : schemas.buildPayloadDeclaration(node.model, node.lifted);
}

/**
 * Builds one Message Object.
 *
 * The field order follows the Message Object table of the specification.
 */
function projectMessage(schemas: SchemaBuilder, node: MessageNode): MessageObject {
  return {
    name: node.key,
    ...text("title", node.title),
    ...text("description", node.description),
    ...text("contentType", node.contentType),
    ...present("headers", projectHeaders(schemas, node.headers)),
    payload: projectPayload(schemas, node.payload),
    ...present("correlationId", node.correlationId),
    ...present("bindings", projectBindings(node.bindings)),
    ...present("tags", node.tags.length > 0 ? structuredClone([...node.tags]) : undefined),
    ...present("externalDocs", node.externalDocs ? { ...node.externalDocs } : undefined),
    ...present("examples", node.examples.length > 0 ? [...node.examples] : undefined),
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
export function projectMessages(
  schemas: SchemaBuilder,
  nodes: readonly MessageNode[],
): Record<string, MessageObject> | undefined {
  if (nodes.length === 0) return undefined;
  // A null prototype keeps a key such as `__proto__` an ordinary own
  // property. A plain object literal would run the inherited setter instead,
  // dropping the message and replacing the map's prototype. This matches
  // `SchemaBuilder.getSchemas`.
  const messages = Object.create(null) as Record<string, MessageObject>;
  for (const node of nodes) {
    messages[node.key] = projectMessage(schemas, node);
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
 * This has to run in the project half, and it has to run last. A schema key
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
