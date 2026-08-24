/**
 * The Protobuf provider, as the registry holds it.
 *
 * The two halves it joins already exist. The capture runs the official
 * emitter and keeps its `.proto` text in memory. The index decides which
 * model each text describes. This file is the seam between them and the
 * registry, and it holds no logic of its own.
 *
 * The provider is built rather than exported as a constant, because the
 * capture needs the performance reporter of the emit that asked for it. That
 * reporter arrives with the `EmitContext` and cannot be read from a module.
 */

import type { EmitContext, Program } from "@typespec/compiler";
import { captureProtobufFiles } from "./protobuf-capture.js";
import { indexProtobufArtifacts } from "./protobuf-index.js";
import type { CollectedSchemaArtifacts, SchemaArtifactProvider } from "./provider.js";

/**
 * Builds the provider that answers the `protobuf` preview feature.
 *
 * @param perf - The performance reporter this emit was given, passed on to
 * the official emitter the capture runs
 * @returns The provider, ready for the registry
 * @internal
 */
export function createProtobufProvider(perf: EmitContext["perf"]): SchemaArtifactProvider {
  return {
    id: "protobuf",
    async collect(program: Program): Promise<CollectedSchemaArtifacts> {
      return indexProtobufArtifacts(program, await captureProtobufFiles(program, perf));
    },
  };
}
