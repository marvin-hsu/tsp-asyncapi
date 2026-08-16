import { Program, Service, getDoc } from "@typespec/compiler";
import { InfoObject } from "../types.js";
import { getInfo } from "../decorators/index.js";
import { buildTags } from "./tags.js";
import { buildExternalDocs } from "./external-docs.js";
import { DEFAULT_DOCUMENT_TITLE, DEFAULT_INFO_VERSION } from "../constants.js";

/**
 * Builds the AsyncAPI Info object from the TypeSpec service.
 */
export function buildInfo(program: Program, service: Service): InfoObject {
  const serviceType = service.type;

  const info: InfoObject = {
    title: service.title ?? DEFAULT_DOCUMENT_TITLE,
    version: DEFAULT_INFO_VERSION,
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
