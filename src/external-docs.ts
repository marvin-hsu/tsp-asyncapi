import { Program, Type } from "@typespec/compiler";
import { ExternalDocumentationObject } from "./types/index.js";
import { getExternalDocs } from "./decorators/index.js";

/**
 * Extracts external documentation from a TypeSpec type.
 */
export function buildExternalDocs(
  program: Program,
  target: Type,
): ExternalDocumentationObject | undefined {
  const extDocs = getExternalDocs(program, target);
  if (extDocs) {
    return {
      url: extDocs.url,
      description: extDocs.description,
    };
  }
  return undefined;
}
