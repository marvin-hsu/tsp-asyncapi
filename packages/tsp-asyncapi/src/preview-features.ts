/**
 * Answering a request for a preview feature this release cannot do.
 *
 * A name is reserved in `emitter-options.ts` before the provider behind it
 * exists. Reserving it early is deliberate: a project that writes `protobuf`
 * gets an answer about the feature, not a schema error about an unknown
 * value.
 *
 * No provider exists in this release, so every requested feature is refused
 * here. When the first provider lands, this file gains the set of features
 * that do work and hands it to the pipeline.
 *
 * ## Why an unavailable feature is an error, not a warning
 *
 * A project that asks for a feature expects the output to change. Ignoring
 * the request quietly gives that project a document that describes something
 * else. Nothing in that file would say so.
 *
 * A diagnostic alone does not prevent it. Reporting one records the error and
 * lets the emitter carry on, so the misleading document still reaches the
 * disk. The caller stops before writing anything, and this function tells it
 * when to.
 */

import { NoTarget, Program } from "@typespec/compiler";
import { reportDiagnostic } from "tsp-asyncapi-core";
import type { AsyncAPIEmitterOptions } from "./emitter-options.js";

/**
 * Reports every requested preview feature that this release cannot honor.
 *
 * The option is validated against the schema before this runs, so every name
 * that arrives here is one of the reserved ones. What is left to decide is
 * whether the provider behind it exists, and in this release none does.
 *
 * The target is `NoTarget`, because the request is in `tspconfig.yaml` and
 * not in any TypeSpec source file. That is the same choice
 * `@typespec/openapi3` makes for a diagnostic about one of its own options.
 *
 * @param program - The program, to report against
 * @param options - The emitter options as the compiler validated them
 * @returns Whether anything was refused. The caller writes no file when it was.
 * @internal
 */
export function reportUnavailablePreviewFeatures(
  program: Program,
  options: AsyncAPIEmitterOptions,
): boolean {
  const requested = options["preview-features"] ?? [];
  for (const feature of requested) {
    reportDiagnostic(program, {
      code: "preview-feature-unavailable",
      target: NoTarget,
      format: { feature },
    });
  }
  return requested.length > 0;
}
