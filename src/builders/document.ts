import { Model, Program, Service } from "@typespec/compiler";
import { AsyncAPIDocument, ComponentsObject } from "../types.js";
import { AsyncAPIEmitterOptions } from "../lib.js";
import { reportUnattachedBindings } from "./bindings/builder.js";
import { buildChannels } from "./channels/builder.js";
import { buildOperations } from "./operations/builder.js";
import { buildInfo } from "./info.js";
import { buildMessages } from "./messages/builder.js";
import { reportUnresolvedRawSchemaRefs } from "./messages/raw-schema-refs.js";
import { SchemaBuilder } from "./schemas/builder.js";
import {
  buildServers,
  reportSecurityUsesWithoutServer,
  reportServersOutsideService,
} from "./servers.js";
import { buildSecuritySchemes } from "./security-schemes.js";
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
  // The security schemes come from the whole program, not from the service
  // namespace. `components` is a document-wide registry, and a scheme is
  // reached by name rather than by the namespace it sits on.
  const securitySchemes = buildSecuritySchemes(program);

  const components: ComponentsObject = {
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(messages ? { messages } : {}),
    ...(securitySchemes ? { securitySchemes } : {}),
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
  const { channels, emitted } = buildChannels(program, messageKeys);

  // Servers come from the service namespace, the same source as `info`. A
  // server on any other namespace is reported, then left out.
  reportServersOutsideService(program, service?.type);
  // A `@useSecurity` reaches the document through a server, so one whose
  // namespace contributes no server is reported too.
  reportSecurityUsesWithoutServer(program, service?.type);
  // The servers are built after the components, so the full set of scheme
  // keys is known here. A `@useSecurity` naming anything else would emit a
  // reference no parser can resolve, so the builder needs this set.
  const declaredSchemes = new Set(Object.keys(components?.securitySchemes ?? {}));
  const servers = service ? buildServers(program, service.type, declaredSchemes) : undefined;

  // The operations are built after the channels. An operation refers to its
  // channel and to one message of that channel, so it needs the id and the
  // message keys of every channel that reached the document.
  const operations = buildOperations(program, emitted, messageKeys, declaredSchemes);

  // The bindings are checked last. A binding reaches its object through
  // whichever builder emits that object, and the four builders have all run
  // by now. Anything still unplaced had every chance to be placed.
  reportUnattachedBindings(program);

  // The root document. Its version comes from `ASYNCAPI_VERSION`.
  const document: AsyncAPIDocument = {
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
    // `operations` is required, so an empty map is emitted when the program
    // declares no operation.
    operations,
    ...(components ? { components } : {}),
  };

  // A raw schema is copied verbatim, so a reference inside it can point at a
  // location the document never got. Only the finished document answers that,
  // so this check runs last.
  reportUnresolvedRawSchemaRefs(program, document, messageKeys);

  return document;
}
