import { Program, Service } from "@typespec/compiler";
import { AsyncAPIDocument, ComponentsObject } from "../types/index.js";
import { AsyncAPIEmitterOptions } from "../lib.js";
import { buildInfo } from "./info.js";
import { buildMessages } from "./messages.js";
import { SchemaBuilder } from "./schemas/builder.js";
import { buildServers, reportServersOutsideService } from "./servers.js";

/**
 * Builds the `components` section.
 * The messages are built first, and they drive the schema collection. Only
 * a model that a message payload reaches gets a `components.schemas` entry.
 * A model that no message reaches is not emitted at all.
 * An empty section, or an empty entry inside it, is omitted.
 */
function buildComponents(program: Program): ComponentsObject | undefined {
  const schemaBuilder = new SchemaBuilder(program);
  const messages = buildMessages(program, schemaBuilder);
  const schemas = schemaBuilder.getSchemas();

  const components: ComponentsObject = {
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(messages ? { messages } : {}),
  };
  return Object.keys(components).length > 0 ? components : undefined;
}

/**
 * Builds the AsyncAPI root document skeleton.
 */
export function buildAsyncAPIDocument(
  program: Program,
  service: Service | undefined,
  options: AsyncAPIEmitterOptions,
): AsyncAPIDocument {
  const components = buildComponents(program);

  // Servers come from the service namespace, the same source as `info`. A
  // server on any other namespace is reported, then left out.
  reportServersOutsideService(program, service?.type);
  const servers = service ? buildServers(program, service.type) : undefined;

  // Base AsyncAPI 3.1.0 Document Skeleton
  return {
    asyncapi: "3.1.0",
    ...(options["asyncapi-id"] ? { id: options["asyncapi-id"] } : {}),
    info: service ? buildInfo(program, service) : { title: "AsyncAPI Document", version: "0.0.0" },
    ...(options["default-content-type"]
      ? { defaultContentType: options["default-content-type"] }
      : {}),
    ...(servers ? { servers } : {}),
    channels: {},
    operations: {},
    ...(components ? { components } : {}),
  };
}
