/**
 * The tools that generate a schema, and the one index they produce together.
 *
 * A provider wraps another schema tool. It reads the whole program, runs that
 * tool, and reports which model each schema it produced belongs to. What it
 * returns is plain data, so the tool it wraps stays inside this file's half of
 * the build: `tsp-asyncapi-core` receives the index and never the tool.
 *
 * Collection runs before resolve. It is not a stage of the pipeline, because
 * it writes nothing into the document and hands the next step an immutable
 * value.
 *
 * The registry below names every provider this release ships. A preview
 * feature with no provider in it is refused before anything is written.
 */

import type { Model, Program } from "@typespec/compiler";
import {
  emptySchemaArtifacts,
  reportDiagnostic,
  type ExternalSchemaArtifact,
  type SchemaArtifactIndex,
} from "tsp-asyncapi-core";
import type { PreviewFeature } from "../emitter-options.js";

/**
 * One tool that generates schemas for the models of a program.
 *
 * The id is the preview feature that turns the provider on. So a provider and
 * the name a project writes in `tspconfig.yaml` cannot drift apart.
 *
 * `collect` is asynchronous. A provider may run another tool, and the
 * signature is fixed before the first one lands.
 *
 * @internal
 */
export interface SchemaArtifactProvider {
  /** The preview feature this provider implements. */
  readonly id: PreviewFeature;
  /**
   * Runs the tool over one program.
   *
   * @param program - The compiled program
   * @returns Every schema the tool produced, and whether it had to refuse a
   * model it was asked about
   */
  collect(program: Program): Promise<CollectedSchemaArtifacts>;
}

/**
 * Every provider this release ships.
 *
 * The registry is built per emit rather than kept as a module-level constant.
 * Nothing here reads a module-level value, so two emits of one program each
 * get their own providers.
 *
 * What this list holds also decides which preview feature is available. A
 * reserved name with no provider here is refused, and the emitter writes no
 * document for it. The list is empty until the Protobuf provider lands, so
 * every reserved name is refused today.
 *
 * @returns The providers, in a fixed order
 * @internal
 */
export function shippedProviders(): readonly SchemaArtifactProvider[] {
  return [];
}

/**
 * The preview features a registry can honor.
 *
 * @param providers - The registry to read
 * @returns The id of every provider in it
 * @internal
 */
export function availableFeatures(
  providers: readonly SchemaArtifactProvider[],
): ReadonlySet<PreviewFeature> {
  return new Set(providers.map((provider) => provider.id));
}

/** The two slots of a message that take a generated schema. */
type ArtifactSlot = "payload" | "headers";

/**
 * What one collection produced, and whether it refused anything.
 *
 * The caller needs both. A refused model leaves the index, so a document
 * built from `artifacts` alone would describe that model with the schema its
 * TypeSpec type produces and say nothing about the request.
 *
 * Two things refuse a model. A provider refuses one it cannot answer for. The
 * merge refuses one that two providers claimed. Both leave the same hole, so
 * both raise the same flag.
 *
 * @internal
 */
export interface CollectedSchemaArtifacts {
  /** Every artifact that survived. */
  readonly artifacts: SchemaArtifactIndex;
  /** Whether any model the collection was asked about went unanswered. */
  readonly refused: boolean;
}

/**
 * Runs each enabled provider and merges what they produced.
 *
 * @param program - The compiled program
 * @param features - The preview features the project turned on
 * @param providers - The registry to select from. A test passes its own.
 * @returns The artifacts and whether a conflict removed any of them
 * @internal
 */
export async function collectSchemaArtifacts(
  program: Program,
  features: ReadonlySet<PreviewFeature>,
  providers: readonly SchemaArtifactProvider[],
): Promise<CollectedSchemaArtifacts> {
  const enabled = providers.filter((provider) => features.has(provider.id));
  if (enabled.length === 0) return { artifacts: emptySchemaArtifacts, refused: false };

  const collected = await Promise.all(enabled.map((provider) => provider.collect(program)));
  const indexes = collected.map((one) => one.artifacts);
  const payload = mergeSlot(
    program,
    "payload",
    indexes.map((index) => index.payloadFor),
  );
  const headers = mergeSlot(
    program,
    "headers",
    indexes.map((index) => index.headersFor),
  );
  return {
    artifacts: { payloadFor: payload.artifacts, headersFor: headers.artifacts },
    refused: payload.refused || headers.refused || collected.some((one) => one.refused),
  };
}

/**
 * Merges one slot of every index into one map.
 *
 * Two providers that claim one model and one slot are a conflict, and there
 * is no winner. Keeping the first would make the answer depend on the order
 * the registry lists them, which is not something a project states. So both
 * are dropped.
 *
 * The model is then left with the schema its TypeSpec type produces, which
 * answers the project with output that ignores its request. Reporting the
 * error does not stop that on its own, because the emitter writes the file
 * whatever the diagnostics say. So the conflict is returned to the caller
 * too, and the caller writes nothing.
 *
 * @param program - The program, to report against
 * @param slot - Which schema of the message the conflict is about
 * @param maps - What each enabled provider produced for that slot
 * @returns The artifacts no other provider also claimed, and whether any
 * conflict was found
 */
function mergeSlot(
  program: Program,
  slot: ArtifactSlot,
  maps: readonly ReadonlyMap<Model, ExternalSchemaArtifact>[],
): { artifacts: ReadonlyMap<Model, ExternalSchemaArtifact>; refused: boolean } {
  const merged = new Map<Model, ExternalSchemaArtifact>();
  const conflicted = new Set<Model>();

  for (const map of maps) {
    for (const [model, artifact] of map) {
      const owner = merged.get(model);
      if (owner === undefined) {
        merged.set(model, artifact);
        continue;
      }
      if (conflicted.has(model)) continue;
      conflicted.add(model);
      reportDiagnostic(program, {
        code: "conflicting-generated-schema-source",
        target: model,
        format: { slot, first: owner.provider, second: artifact.provider },
      });
    }
  }

  for (const model of conflicted) merged.delete(model);
  return { artifacts: merged, refused: conflicted.size > 0 };
}
