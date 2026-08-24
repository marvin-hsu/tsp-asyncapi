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
import { emptySchemaArtifacts, type SchemaArtifactIndex } from "tsp-asyncapi-core";
import { lowerDocument } from "./lower/document.js";
import { AsyncAPIDocument } from "./types/index.js";

/**
 * Runs resolve and lower over one program.
 *
 * The result is a promise, and the two stages inside are synchronous. The
 * promise is part of the contract rather than of the work: a provider of
 * generated schemas runs an external emitter, which is asynchronous, and the
 * stages will read what it produced. Every caller already awaits, so the step
 * that makes the body asynchronous changes this file alone.
 *
 * @param program - The compiled program
 * @param service - The service the document describes, if the program has one
 * @param options - The emitter options that reach the document itself
 * @param artifacts - The schemas a preview feature generated for this
 * program. A build with no preview feature on passes none.
 * @returns The document object tree
 * @internal
 */
export function buildAsyncAPIDocument(
  program: Program,
  service: Service | undefined,
  options: AsyncAPIEmitterOptions,
  artifacts: SchemaArtifactIndex = emptySchemaArtifacts,
): Promise<AsyncAPIDocument> {
  // One build owns one record of which binding applications it placed. It is
  // passed explicitly, so two builds of one program cannot see each other's.
  const placements = new BindingPlacements();
  return Promise.resolve(
    lowerDocument(program, resolveService(program, service, placements, artifacts), options),
  );
}
