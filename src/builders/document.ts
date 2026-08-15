import { Program, Service } from "@typespec/compiler";
import { AsyncAPIDocument } from "../types/index.js";
import { AsyncAPIEmitterOptions } from "../lib.js";
import { buildInfo } from "./info.js";
import { buildServers, reportServersOutsideService } from "./servers.js";

/**
 * Builds the AsyncAPI root document skeleton.
 */
export function buildAsyncAPIDocument(
  program: Program,
  service: Service | undefined,
  options: AsyncAPIEmitterOptions,
): AsyncAPIDocument {
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
    components: {},
  };
}
