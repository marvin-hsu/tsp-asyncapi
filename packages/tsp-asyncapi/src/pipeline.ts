/**
 * The three stages, in order.
 *
 * ```
 * resolve    program + decorator state → AsyncAPIService
 * lower      AsyncAPIService (+program) → AsyncAPIDocument
 * serialize  AsyncAPIDocument → YAML or JSON
 * ```
 *
 * Each stage hands the next a value. Nothing is shared and nothing is
 * mutable across the boundary, so a program can be resolved and lowered more
 * than once. That is what emitting one document per version, or per service,
 * needs.
 */

import { Program, Service } from "@typespec/compiler";
import type { AsyncAPIEmitterOptions } from "./emitter-options.js";
import { BindingPlacements, resolveService } from "tsp-asyncapi-core/unstable";
import { lowerDocument } from "./lower/document.js";
import { AsyncAPIDocument } from "./types/index.js";

/**
 * Runs resolve and lower over one program.
 *
 * @param program - The compiled program
 * @param service - The service the document describes, if the program has one
 * @param options - The emitter options that reach the document itself
 * @returns The document object tree
 * @internal
 */
export function buildAsyncAPIDocument(
  program: Program,
  service: Service | undefined,
  options: AsyncAPIEmitterOptions,
): AsyncAPIDocument {
  // One build owns one record of which binding applications it placed. It is
  // passed explicitly, so two builds of one program cannot see each other's.
  const placements = new BindingPlacements();
  return lowerDocument(program, resolveService(program, service, placements), options);
}
