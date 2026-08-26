/**
 * The Avro provider, as the registry holds it.
 *
 * This provider owns none of the translation. `tsp-avro` walks a model into an
 * Avro schema and renders that schema as JSON, and this file calls it. The
 * Protobuf provider next door had to read the state of a third party library
 * and write the walk itself, because that library emits files and exposes no
 * walk. `tsp-avro` is ours, so a second walk here would be a copy that drifts.
 *
 * ## Why the library is loaded at run time
 *
 * `tsp-avro` is experimental and this package is not. A static import would
 * make every project that installs this emitter install that one, and would
 * tie a stable release to a `0.x` version range. So the import is dynamic and
 * runs only when the preview feature is on. A project that never turns it on
 * never loads it.
 *
 * ## Who gets told
 *
 * A payload is built only for a model the document asks one for, which is a
 * model that carries `@AsyncAPI.message` as well. A project that writes
 * `@Avro.avroRecord` for types outside the document keeps its build green, and no
 * diagnostic names a model no message describes.
 *
 * A model the document asks about and this cannot answer for is a refusal.
 * The caller stops on one. Its payload would otherwise fall back to the schema
 * its TypeSpec type produces, which answers a request for Avro with ordinary
 * JSON Schema and says so nowhere in the file.
 *
 * ## Why the reason is rewritten
 *
 * The walk collects its refusals rather than reporting them. Reporting them
 * would show a user the codes of a library they never asked to emit, and a
 * project that emits both Avro files and an AsyncAPI document would read every
 * refusal twice. So the reason is carried into this library's own diagnostic,
 * and one compile speaks with one voice.
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
 * The AsyncAPI specification lists this string for Avro. It names no `+json`
 * variant here, because the schema is written as an object rather than as
 * text, which is what the specification asks of a JSON based format.
 */
const AVRO_SCHEMA_FORMAT = "application/vnd.apache.avro;version=1.9.0";

/** The name of the provider, as a diagnostic and a test read it. */
const PROVIDER_ID = "avro";

/**
 * Builds the provider that answers the `avro` preview feature.
 *
 * The provider is built rather than exported as a constant, so two emits of
 * one program each get their own. Nothing in it holds state between calls.
 *
 * The loader is a parameter because a broken install cannot be arranged by a
 * source file. A test states a loader that fails, and the shipped registry
 * takes the default.
 *
 * @param load - How to reach the Avro library
 * @returns The provider, ready for the registry
 * @internal
 */
export function createAvroProvider(load: AvroLoader = loadAvro): SchemaArtifactProvider {
  return { id: PROVIDER_ID, collect: (program) => collectAvroArtifacts(program, load) };
}

/**
 * How the provider reaches the Avro library.
 *
 * The loader only loads. It rejects when the library is not there, and the
 * caller turns that into a diagnostic. So a test that states a broken install
 * states the failure alone, and the code that reports it is the shipped code.
 *
 * @internal
 */
export type AvroLoader = () => Promise<AvroLibrary>;

/**
 * The part of `tsp-avro` this provider calls.
 *
 * The two entry points are held as they were loaded, and their types come from
 * the loader rather than from a copy written here. A copy would be a second
 * declaration of someone else's signature, and the two would drift.
 *
 * `typeof import(...)` in a type position names a module without loading one.
 * The only load in this file is the one inside {@link loadAvro}.
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
 * The two entry points are loaded together, because the provider calls both.
 * A rejection means the library is not installed, and the caller says so.
 *
 * @returns The two entry points of the library
 */
async function loadAvro(): Promise<AvroLibrary> {
  const [main, unstable] = await Promise.all([import("tsp-avro"), import("tsp-avro/unstable")]);
  return { main, unstable };
}

/**
 * Renders a payload for every message model `@Avro.avroRecord` marks.
 *
 * @param program - The compiled program
 * @param load - How to reach the Avro library
 * @returns The payload artifact of every model that got one, and whether any
 * model the document names went unanswered
 */
async function collectAvroArtifacts(
  program: Program,
  load: AvroLoader,
): Promise<CollectedSchemaArtifacts> {
  let avro: AvroLibrary;
  try {
    avro = await load();
  } catch (error) {
    // The author writes `@Avro.avroRecord`, so the library is installed whenever a
    // model carries it. A load that fails is a broken install, and the
    // diagnostic says so rather than leaving the emit silent.
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
    // A model outside the document is not asked about, so it is neither
    // rendered nor reported. A report for such a model would name a message
    // that does not exist.
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
      // An object, not text. Avro is JSON, and AsyncAPI inlines a schema of a
      // JSON based format rather than carrying it as a string.
      schema: avro.unstable.renderAvroSchema(record),
      provider: PROVIDER_ID,
      identity: fullNameOf(record),
    });
  }

  return { artifacts: { payloadFor, headersFor: new Map() }, refused };
}

/**
 * The reason a refusal carries.
 *
 * The walk promises at least one, and it keeps walking after the first, so a
 * model with several problems collects several. Only the first is carried
 * here: a diagnostic says one thing, and the author reads the rest by running
 * the Avro emitter itself.
 *
 * A walk that keeps its promise never reaches the fallback. A walk that breaks
 * it must not produce a diagnostic with a hole in the middle, because the
 * reason sits inside a sentence. So the fallback names the walk as the place
 * the reason went missing.
 *
 * @param diagnostics - What the walk collected
 * @returns The message of the first one, or a sentence saying there was none
 */
function firstReason(diagnostics: readonly Diagnostic[]): string {
  const first = diagnostics.length === 0 ? "" : diagnostics[0].message;
  return first === "" ? "The Avro walk gave no reason." : first;
}

/**
 * The name an Avro reader knows this record by.
 *
 * The identity never reaches the document. It tells two artifacts apart, and
 * two records differ by their namespace as well as by their name. So the
 * namespace is part of it whenever the record declares one.
 *
 * @param record - The record the walk built
 * @returns The Avro full name
 */
function fullNameOf(record: AvroFullName): string {
  return record.namespace === undefined ? record.name : `${record.namespace}.${record.name}`;
}

/**
 * The text of whatever a failed load threw.
 *
 * @param error - What the import rejected with
 * @returns Its message, or its own text when it is not an error
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
