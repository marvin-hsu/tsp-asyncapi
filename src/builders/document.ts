import { Program, Service } from "@typespec/compiler";
import { AsyncAPIDocument } from "../types/index.js";
import { AsyncAPIEmitterOptions } from "../lib.js";
import { buildInfo } from "./info.js";

/**
 * Builds the AsyncAPI root document skeleton.
 */
export function buildAsyncAPIDocument(
  program: Program,
  service: Service | undefined,
  options: AsyncAPIEmitterOptions
): AsyncAPIDocument {
  // Base AsyncAPI 3.1.0 Document Skeleton
  const doc: AsyncAPIDocument = {
    asyncapi: "3.1.0",
    ...(options["asyncapi-id"] ? { id: options["asyncapi-id"] } : {}),
    info: service ? buildInfo(program, service) : { title: "AsyncAPI Document", version: "0.0.0" },
    ...(options["default-content-type"] ? { defaultContentType: options["default-content-type"] } : {}),
    channels: {},
    operations: {},
    components: {},
  };

  return doc;
}
