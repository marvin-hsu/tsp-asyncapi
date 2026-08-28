/**
 * The Avro provider, as the registry holds it.
 *
 * `tsp-avro` walks a model into an Avro schema and renders it as JSON. This
 * file only calls it. Unlike the Protobuf provider next door, it never
 * re-implements that walk, since `tsp-avro` already owns one.
 *
 * The library loads dynamically. It is experimental and optional, so a
 * static import would force every installer to pull an unstable dependency.
 * The import runs only when the `avro` preview feature is on.
 *
 * A payload is built only for a model the document asks about, one that
 * also carries `@AsyncAPI.message`. A model this cannot answer for is a
 * refusal. The caller stops on one rather than falling back to the plain
 * JSON Schema its TypeSpec type would otherwise produce. The walk's own
 * diagnostics are collapsed into one reason per refusal. That reason is
 * reported through this provider's own diagnostic. One compile then speaks
 * with one voice, instead of doubling up with the Avro emitter's
 * diagnostics.
 */

import type { Diagnostic, Model, Program } from "@typespec/compiler";
import {
  emptySchemaArtifacts,
  listMessages,
  reportDiagnostic,
  type ExternalSchemaArtifact,
} from "tsp-asyncapi-core";
import type { CollectedSchemaArtifacts, SchemaArtifactProvider } from "./provider.js";

/**
 * The AsyncAPI schema format of an Avro schema.
 *
 * The AsyncAPI specification lists this string for Avro. No `+json` variant
 * applies, since the schema is written as an object, not as text.
 */
const AVRO_SCHEMA_FORMAT = "application/vnd.apache.avro;version=1.9.0";

/** The name of the provider, as a diagnostic and a test read it. */
const PROVIDER_ID = "avro";

/**
 * Builds the provider that answers the `avro` preview feature.
 *
 * Returns a fresh provider per call, since nothing in it holds state
 * between emits. `load` is a parameter so a test can supply one that
 * fails, exercising a broken install without touching the shipped default.
 *
 * @param load - How to reach the Avro library
 *
 * @internal
 */
export function createAvroProvider(load: AvroLoader = loadAvro): SchemaArtifactProvider {
  return { id: PROVIDER_ID, collect: (program) => collectAvroArtifacts(program, load) };
}

/**
 * How the provider reaches the Avro library.
 *
 * Rejects when the library is not installed. The caller turns that into a
 * diagnostic, so a test can state the failure alone.
 *
 * @internal
 */
export type AvroLoader = () => Promise<AvroLibrary>;

/**
 * The part of `tsp-avro` this provider calls.
 *
 * Types come from the loader, not from a copy written here, so the two
 * cannot drift apart. `typeof import(...)` names a module without loading
 * it. The only load in this file is inside {@link loadAvro}.
 */
interface AvroLibrary {
  /** The main entry point, which lists the models the author marked. */
  readonly main: typeof import("tsp-avro");
  /** The unstable entry point, which walks one model and renders one schema. */
  readonly unstable: typeof import("tsp-avro/unstable");
}

/** The two members of a record this file reads. The rest it passes on. */
interface AvroFullName {
  readonly name: string;
  readonly namespace?: string;
}

/**
 * Loads `tsp-avro`.
 *
 * Loads both entry points together, since the provider calls both. A
 * rejection means the library is not installed.
 */
async function loadAvro(): Promise<AvroLibrary> {
  const [main, unstable] = await Promise.all([import("tsp-avro"), import("tsp-avro/unstable")]);
  return { main, unstable };
}

/**
 * Renders a payload for every message model `@Avro.record` marks.
 *
 * `refused` is set when any model the document asks about went unanswered.
 *
 * @param program - The compiled program
 * @param load - How to reach the Avro library
 */
async function collectAvroArtifacts(
  program: Program,
  load: AvroLoader,
): Promise<CollectedSchemaArtifacts> {
  let avro: AvroLibrary;
  try {
    avro = await load();
  } catch (error) {
    // A model carrying `@Avro.record` implies the library is installed.
    // A load failure means a broken install, so it gets a diagnostic.
    reportDiagnostic(program, {
      code: "avro-library-missing",
      target: program.getGlobalNamespaceType(),
      format: { reason: messageOf(error) },
    });
    return { artifacts: emptySchemaArtifacts, refused: true };
  }

  const asked = listMessages(program);
  const payloadFor = new Map<Model, ExternalSchemaArtifact>();

  let refused = false;
  for (const model of avro.main.listRecords(program)) {
    // A model outside the document is skipped, not reported: a diagnostic
    // for it would name a message that does not exist.
    if (!asked.has(model)) continue;

    const [record, diagnostics] = avro.unstable.buildAvroRecordWithDiagnostics(program, model);
    if (record === undefined) {
      reportDiagnostic(program, {
        code: "avro-artifact-unavailable",
        target: model,
        format: { name: model.name, reason: firstReason(diagnostics) },
      });
      refused = true;
      continue;
    }

    payloadFor.set(model, {
      schemaFormat: AVRO_SCHEMA_FORMAT,
      // An object, not text: AsyncAPI inlines a JSON-based schema.
      schema: avro.unstable.renderAvroSchema(record),
      provider: PROVIDER_ID,
      identity: fullNameOf(record),
    });
  }

  return { artifacts: { payloadFor }, refused };
}

/**
 * The reason a refusal carries.
 *
 * The walk keeps going after the first problem, so several can pile up.
 * Only the first is used: a diagnostic says one thing, and the author reads
 * the rest by running the Avro emitter directly. The fallback text guards
 * against a walk that breaks its promise of at least one diagnostic. It
 * keeps the reason from going missing from the middle of a sentence.
 *
 * @param diagnostics - What the walk collected
 */
function firstReason(diagnostics: readonly Diagnostic[]): string {
  const first = diagnostics.length === 0 ? "" : diagnostics[0].message;
  return first === "" ? "The Avro walk gave no reason." : first;
}

/**
 * The name an Avro reader knows this record by.
 *
 * Never reaches the document. It only tells two artifacts apart. Two
 * records can share a name but differ by namespace, so the namespace is
 * included whenever the record declares one.
 *
 * @param record - The record the walk built
 */
function fullNameOf(record: AvroFullName): string {
  return record.namespace === undefined ? record.name : `${record.namespace}.${record.name}`;
}

/**
 *  The text of whatever a failed load threw.
 *
 * @param error - What the import rejected with
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
