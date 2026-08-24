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
 * The registry below is empty. The seam is complete without a provider in it,
 * and a provider is what the next step adds.
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
 * `collect` is asynchronous because a provider loads and runs another
 * emitter.
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
   * @returns Every schema the tool produced, by model and by slot
   */
  collect(program: Program): Promise<SchemaArtifactIndex>;
}

/**
 * Every provider this release ships.
 *
 * It is empty, so every requested preview feature is still refused before a
 * document is written.
 */
const PROVIDERS: readonly SchemaArtifactProvider[] = [];

/** The two slots of a message that take a generated schema. */
type ArtifactSlot = "payload" | "headers";

/**
 * Runs each enabled provider and merges what they produced.
 *
 * @param program - The compiled program
 * @param features - The preview features the project turned on
 * @param providers - The registry to select from. A test passes its own.
 * @returns One index holding every artifact, with each conflict reported
 * @internal
 */
export async function collectSchemaArtifacts(
  program: Program,
  features: ReadonlySet<PreviewFeature>,
  providers: readonly SchemaArtifactProvider[] = PROVIDERS,
): Promise<SchemaArtifactIndex> {
  const enabled = providers.filter((provider) => features.has(provider.id));
  if (enabled.length === 0) return emptySchemaArtifacts;

  const indexes = await Promise.all(enabled.map((provider) => provider.collect(program)));
  return {
    payloadFor: mergeSlot(
      program,
      "payload",
      indexes.map((index) => index.payloadFor),
    ),
    headersFor: mergeSlot(
      program,
      "headers",
      indexes.map((index) => index.headersFor),
    ),
  };
}

/**
 * Merges one slot of every index into one map.
 *
 * Two providers that claim one model and one slot are a conflict, and there
 * is no winner. Keeping the first would make the answer depend on the order
 * the registry lists them, which is not something a project states. So both
 * are dropped, and the model falls back to the schema its TypeSpec type
 * produces. The diagnostic is an error, so nothing is written anyway.
 *
 * @param program - The program, to report against
 * @param slot - Which schema of the message the conflict is about
 * @param maps - What each enabled provider produced for that slot
 * @returns The artifacts no other provider also claimed
 */
function mergeSlot(
  program: Program,
  slot: ArtifactSlot,
  maps: readonly ReadonlyMap<Model, ExternalSchemaArtifact>[],
): ReadonlyMap<Model, ExternalSchemaArtifact> {
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
  return merged;
}
