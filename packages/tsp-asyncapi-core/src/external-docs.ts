import { Program, Type } from "@typespec/compiler";
import type { ExternalDocumentationObject } from "./types/index.js";
import { getExternalDocs } from "./decorators/index.js";

/**
 * Builds the `externalDocs` object for a type, or `undefined` when the type
 * carries no `@externalDocs`. The caller leaves the field out of the emitted
 * object in that case.
 *
 * @param program - The program to read the state from
 * @param target - The type the decorator was applied to
 *
 * @public
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
