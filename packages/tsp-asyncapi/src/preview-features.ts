/**
 * Answers a request for a preview feature this release cannot honor.
 *
 * A name is reserved in `emitter-options.ts` before its provider exists.
 * So a project that writes `protobuf` gets an answer about the feature,
 * not a schema error about an unknown value. The registry of providers
 * decides which names currently work; this file is handed that set.
 *
 * An unavailable feature is an error, not a warning. A project that asks for
 * a feature expects the output to change, and a diagnostic alone does not
 * stop a misleading document from reaching disk. The caller stops before
 * writing anything, and this function tells it when to.
 */

import { NoTarget, Program } from "@typespec/compiler";
import { reportDiagnostic } from "tsp-asyncapi-core";
import type { AsyncAPIEmitterOptions, PreviewFeature } from "./emitter-options.js";

/**
 * Reports every requested preview feature that this release cannot honor.
 *
 * The option is validated against the schema before this runs, so every name
 * that arrives here is one of the reserved ones. What is left to decide is
 * whether the provider behind it exists.
 *
 * The target is `NoTarget`, because the request is in `tspconfig.yaml` and
 * not in any TypeSpec source file. `@typespec/openapi3` makes the same
 * choice for a diagnostic about one of its own options.
 *
 * @param program - The program, to report against
 * @param options - The emitter options as the compiler validated them
 * @param available - The features the registry of providers can honor
 * @returns Whether any feature was refused; the caller writes no file when so.
 * @internal
 */
export function reportUnavailablePreviewFeatures(
  program: Program,
  options: AsyncAPIEmitterOptions,
  available: ReadonlySet<PreviewFeature>,
): boolean {
  let refused = false;
  for (const feature of options["preview-features"] ?? []) {
    if (available.has(feature)) continue;
    refused = true;
    reportDiagnostic(program, {
      code: "preview-feature-unavailable",
      target: NoTarget,
      format: { feature },
    });
  }
  return refused;
}
