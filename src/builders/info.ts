import { Program, Service, getDoc } from "@typespec/compiler";
import { InfoObject } from "../types/index.js";
import { getInfo } from "../decorators/index.js";
import { buildTags } from "./tags.js";
import { buildExternalDocs } from "./external-docs.js";

/**
 * Builds the AsyncAPI Info object from the TypeSpec service.
 */
export function buildInfo(program: Program, service: Service): InfoObject {
  const serviceType = service.type;
  
  const info: InfoObject = {
    title: service.title ?? "AsyncAPI Document",
    version: "0.0.0",
  };

  // Handle @info decorator
  const customInfo = getInfo(program, serviceType);
  if (customInfo) {
    Object.assign(info, customInfo);
  }

  // Description via standard @doc if available
  const standardDoc = getDoc(program, serviceType);
  if (standardDoc && !info.description) {
    info.description = standardDoc;
  }

  // Tags
  const tags = buildTags(program, serviceType);
  if (tags) {
    info.tags = tags;
  }

  // External Docs
  const externalDocs = buildExternalDocs(program, serviceType);
  if (externalDocs) {
    info.externalDocs = externalDocs;
  }

  return info;
}
