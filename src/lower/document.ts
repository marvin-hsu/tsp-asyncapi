/**
 * The lower half of the whole document.
 *
 * It takes the semantic model and writes the AsyncAPI document object tree.
 * It reads no decorator state and reports no semantic diagnostic. The two
 * reports that do live here both need something only expansion produces, and
 * each says so where it sits.
 */

import { Program } from "@typespec/compiler";
import { AsyncAPIDocument, ComponentsObject } from "../types/index.js";
import type { AsyncAPIEmitterOptions } from "../emitter-options.js";
import type { AsyncAPIService } from "../resolve/service.js";
import { SchemaBuilder } from "./schemas.js";
import { reportUnresolvedRawSchemaRefs } from "./raw-schema-refs.js";
import { ASYNCAPI_VERSION } from "../constants.js";
import { text } from "../optional-fields.js";
import { lowerChannels } from "./channels.js";
import { lowerInfo } from "./info.js";
import { lowerMessages, reportShadowedSchemaKeys } from "./messages.js";
import { lowerOperations } from "./operations.js";
import { lowerSecuritySchemes } from "./security-schemes.js";
import { lowerServers } from "./servers.js";

/**
 * Builds the `components` section.
 *
 * The messages are lowered first, and lowering them is what drives the schema
 * collection: the schema builder follows a payload into the models it names.
 * So only a model a message reaches gets a `components.schemas` entry.
 *
 * An empty section, or an empty entry inside it, is omitted.
 */
function lowerComponents(
  program: Program,
  service: AsyncAPIService,
  schemaBuilder: SchemaBuilder,
): ComponentsObject | undefined {
  const messages = lowerMessages(schemaBuilder, service.messages);
  // The shadow check reads the schema key owners, so it runs once every key
  // is claimed. A discriminated subtype claims its own only when the pending
  // queue drains, which this call does first.
  reportShadowedSchemaKeys(program, schemaBuilder, service.messages);
  const schemas = schemaBuilder.getSchemas();
  const securitySchemes = lowerSecuritySchemes(service.securitySchemes);

  const components: ComponentsObject = {
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(messages ? { messages } : {}),
    ...(securitySchemes ? { securitySchemes } : {}),
  };
  return Object.keys(components).length > 0 ? components : undefined;
}

/**
 * Builds the AsyncAPI document from the semantic model.
 *
 * @param program - The program, needed only to expand schemas
 * @param service - The semantic model
 * @param options - The emitter options that reach the document itself
 * @returns The document object tree
 * @internal
 */
export function lowerDocument(
  program: Program,
  service: AsyncAPIService,
  options: AsyncAPIEmitterOptions,
): AsyncAPIDocument {
  const schemaBuilder = new SchemaBuilder(program);
  const components = lowerComponents(program, service, schemaBuilder);

  const document: AsyncAPIDocument = {
    asyncapi: ASYNCAPI_VERSION,
    // The two head options answer to the rule every other text field in the
    // document answers to. A blank option names nothing, so it is absent
    // rather than emitted as blank, and a padded one is trimmed. The options
    // schema sets no minimum length, so an author can write either.
    ...text("id", options["asyncapi-id"]),
    info: lowerInfo(service.info),
    ...text("defaultContentType", options["default-content-type"]),
    ...(service.servers.length > 0 ? { servers: lowerServers(service.servers) } : {}),
    // `channels` is required, so an empty map is emitted when the program
    // declares no channel.
    channels: lowerChannels(service.channels),
    // `operations` is required, so an empty map is emitted when the program
    // declares no operation.
    operations: lowerOperations(service.operations),
    ...(components ? { components } : {}),
  };

  // A raw schema is copied verbatim, so a reference inside it can point at a
  // location the document never got. Only the finished document answers that,
  // so this check runs last.
  reportUnresolvedRawSchemaRefs(program, document, new Map(service.messageKeys));

  return document;
}
