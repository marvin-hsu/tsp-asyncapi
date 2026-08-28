/**
 * Turns `@externalDocs` state into the document object it emits as.
 *
 * A schema, an operation, a channel, and the document itself can all carry
 * `@externalDocs`. A caller in an emitter package's `lower/` stage calls this
 * for each one, instead of reading the decorator state directly.
 */

import { Program, Type } from "@typespec/compiler";
import type { ExternalDocumentationObject } from "./types/index.js";
import { getExternalDocs } from "./decorators/index.js";

/**
 * Builds the `externalDocs` object for a type, or `undefined` when the type
 * carries no `@externalDocs`. The caller leaves the field out of the emitted
 * object in that case.
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
