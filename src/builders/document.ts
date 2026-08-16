import { Model, Program, Service } from "@typespec/compiler";
import { AsyncAPIDocument, ComponentsObject } from "../types/index.js";
import { AsyncAPIEmitterOptions } from "../lib.js";
import { buildChannels } from "./channels/builder.js";
import { buildInfo } from "./info.js";
import { buildMessages } from "./messages/builder.js";
import { SchemaBuilder } from "./schemas/builder.js";
import { buildServers, reportServersOutsideService } from "./servers.js";
import { ASYNCAPI_VERSION, DEFAULT_DOCUMENT_TITLE, DEFAULT_INFO_VERSION } from "../constants.js";

/**
 * Builds the `components` section.
 * The messages are built first, and they drive the schema collection. Only
 * a model that a message payload reaches gets a `components.schemas` entry.
 * A model that no message reaches is not emitted at all.
 * An empty section, or an empty entry inside it, is omitted.
 *
 * The message keys travel out with the section. A channel refers to a
 * message by the key that `components.messages` gave it, and only the
 * message builder resolves that key.
 */
function buildComponents(program: Program): {
  components: ComponentsObject | undefined;
  messageKeys: Map<Model, string>;
} {
  const schemaBuilder = new SchemaBuilder(program);
  const { messages, keys } = buildMessages(program, schemaBuilder);
  const schemas = schemaBuilder.getSchemas();

  const components: ComponentsObject = {
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(messages ? { messages } : {}),
  };
  return {
    components: Object.keys(components).length > 0 ? components : undefined,
    messageKeys: keys,
  };
}

/**
 * Builds the AsyncAPI root document skeleton.
 */
export function buildAsyncAPIDocument(
  program: Program,
  service: Service | undefined,
  options: AsyncAPIEmitterOptions,
): AsyncAPIDocument {
  const { components, messageKeys } = buildComponents(program);

  // The channels are built after the components, because a channel refers to
  // its messages by the key `components.messages` gave them.
  const channels = buildChannels(program, messageKeys);

  // Servers come from the service namespace, the same source as `info`. A
  // server on any other namespace is reported, then left out.
  reportServersOutsideService(program, service?.type);
  const servers = service ? buildServers(program, service.type) : undefined;

  // The root document. Its version comes from `ASYNCAPI_VERSION`.
  return {
    asyncapi: ASYNCAPI_VERSION,
    ...(options["asyncapi-id"] ? { id: options["asyncapi-id"] } : {}),
    info: service
      ? buildInfo(program, service)
      : { title: DEFAULT_DOCUMENT_TITLE, version: DEFAULT_INFO_VERSION },
    ...(options["default-content-type"]
      ? { defaultContentType: options["default-content-type"] }
      : {}),
    ...(servers ? { servers } : {}),
    // `channels` is required, so an empty map is emitted when the program
    // declares no channel.
    channels,
    operations: {},
    ...(components ? { components } : {}),
  };
}
