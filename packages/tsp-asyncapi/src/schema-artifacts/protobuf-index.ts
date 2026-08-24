/**
 * Turning captured `.proto` text into artifacts, one per model.
 *
 * The capture gives back the text of every file the official emitter would
 * have written, keyed by its path. This step decides which model each text
 * describes.
 *
 * The decision never comes from a file name or from a message of the same name
 * inside the text. It comes from the official decorator state. Each
 * `@Protobuf.message` model resolves to its nearest `@Protobuf.package`
 * namespace. That package name is matched against the `package` declaration
 * the text carries. So a renamed package, a nested namespace, and two packages
 * that hold a model of one name all map correctly.
 *
 * A model of a package is described by the whole package text, not by the one
 * message inside it. The syntax line, the imports, the enums, and every
 * message a field refers to are all part of the schema. So every model of one
 * package gets one artifact, and they share it.
 *
 * Nothing here falls back to an empty payload. A model with no package, a
 * package with no captured file, and a model the official emitter refused all
 * report a diagnostic instead.
 *
 * ## Who gets told
 *
 * An artifact is built for every `@Protobuf.message` model that has one. A
 * diagnostic is reported only for a model the document asks a payload for,
 * which is a model that also carries `@AsyncAPI.message`. A project that uses
 * the official decorators for types outside the document keeps its build
 * green.
 */

import { NoTarget, type Diagnostic, type Model, type Program } from "@typespec/compiler";
import { listMessages, reportDiagnostic, type ExternalSchemaArtifact } from "tsp-asyncapi-core";
import type { ProtobufCaptureResult } from "./protobuf-capture.js";
import type { CollectedSchemaArtifacts } from "./provider.js";
import { listProtobufMessageModels, resolveProtobufPackage } from "./protobuf-state.js";

/**
 * The AsyncAPI schema format of proto3 text.
 *
 * The AsyncAPI specification lists this string, together with the media type
 * it builds on, for a Protobuf schema.
 */
const PROTOBUF_SCHEMA_FORMAT = "application/vnd.google.protobuf;version=3";

/** The name of the provider, as a diagnostic and a test read it. */
const PROVIDER_ID = "protobuf";

/** The package name of the official Protobuf emitter, as an emit list names it. */
const OFFICIAL_EMITTER = "@typespec/protobuf";

/** What the identity of an artifact says for a package that declares no name. */
const UNNAMED_PACKAGE_IDENTITY = "(no package name)";

/** The `package` declaration of a proto file, which the text carries at most once. */
const PACKAGE_DECLARATION = /^package\s+([^\s;]+)\s*;/m;

/**
 * Why the official emitter wrote no file at all.
 *
 * A silent reason needs no diagnostic, because the compilation writes no
 * document either. Any other reason is reported once, for the whole program.
 */
type EmitSkip = { readonly silent: true } | { readonly silent: false; readonly reason: string };

/**
 * Builds the artifact index of one capture.
 *
 * @param program - The program the capture ran over, to report against
 * A model the document names and this cannot answer for is a refusal. The
 * caller stops on one. Its payload would otherwise fall back to the schema
 * its TypeSpec type produces, which answers a request for proto3 with
 * ordinary JSON Schema and says so nowhere in the file.
 *
 * @param program - The program to report against
 * @param captured - The files and the diagnostics of the capture
 * @returns The payload artifact of every model that got one, and whether any
 * model went unanswered
 * @internal
 */
export function indexProtobufArtifacts(
  program: Program,
  captured: ProtobufCaptureResult,
): CollectedSchemaArtifacts {
  // The skip reason is read before anything is reported, because reporting an
  // error sets the error flag the reason itself looks at.
  const skipped = wholeEmitSkip(program, captured);
  reportCapturedDiagnostics(program, captured.diagnostics);

  if (skipped !== undefined) {
    if (!skipped.silent) {
      reportDiagnostic(program, {
        code: "protobuf-artifact-unavailable",
        messageId: "emit-skipped",
        target: NoTarget,
        format: { reason: skipped.reason },
      });
    }
    // A skip this reported leaves every message without the payload it asked
    // for. A silent skip writes nothing at all, so it has nothing to refuse.
    return {
      artifacts: { payloadFor: new Map(), headersFor: new Map() },
      refused: !skipped.silent,
    };
  }

  const lookup: PackageLookup = {
    program,
    texts: textByPackageName(captured.files),
    refused: modelsTheOfficialEmitterRefused(captured.diagnostics),
    // A model outside the document gets no diagnostic. It still gets an
    // artifact when one exists, so an operation naming it later can use it.
    asked: listMessages(program),
  };
  const artifacts = new Map<string, ExternalSchemaArtifact>();
  const payloadFor = new Map<Model, ExternalSchemaArtifact>();

  let refused = false;
  for (const model of listProtobufMessageModels(program)) {
    const found = packageTextFor(lookup, model);
    if (found !== undefined) {
      payloadFor.set(model, artifactOf(artifacts, found.identity, found.text));
      continue;
    }
    // `asked` holds the models the document names. One of those without an
    // artifact was reported just now, and it is the hole the caller stops on.
    if (lookup.asked.has(model)) refused = true;
  }

  return { artifacts: { payloadFor, headersFor: new Map() }, refused };
}

/** What the per-model lookup reads, so the loop passes one value. */
interface PackageLookup {
  /** The program to report against. */
  readonly program: Program;
  /** The captured text of each package, by the name it declares. */
  readonly texts: ReadonlyMap<string, string>;
  /** The models the official emitter reported an error about. */
  readonly refused: ReadonlySet<Model>;
  /** The models the document asks a payload for. */
  readonly asked: ReadonlyMap<Model, unknown>;
}

/** The text one model is described by, and what its artifact calls itself. */
interface PackageText {
  /** What the artifact calls itself, which is the package name. */
  readonly identity: string;
  /** The proto3 text of the whole package. */
  readonly text: string;
}

/**
 * Finds the package text of one model, reporting when there is none.
 *
 * The three ways a model gets no payload each have their own message. A model
 * the document never mentions is told none of them.
 *
 * @param lookup - What every model in this program is matched against
 * @param model - A model that carries `@Protobuf.message`
 * @returns The text of its package, or `undefined` when it has none
 */
function packageTextFor(lookup: PackageLookup, model: Model): PackageText | undefined {
  const { program } = lookup;
  const tell = lookup.asked.has(model);
  const target = resolveProtobufPackage(program, model);
  if (target === undefined) {
    if (tell) {
      reportDiagnostic(program, {
        code: "protobuf-artifact-unavailable",
        messageId: "no-package",
        target: model,
        format: { name: model.name },
      });
    }
    return undefined;
  }

  const identity = target.name ?? UNNAMED_PACKAGE_IDENTITY;
  if (lookup.refused.has(model)) {
    if (tell) {
      reportDiagnostic(program, {
        code: "protobuf-artifact-unavailable",
        messageId: "not-converted",
        target: model,
        format: { name: model.name, package: identity },
      });
    }
    return undefined;
  }

  const text = lookup.texts.get(target.name ?? "");
  if (text === undefined) {
    if (tell) {
      reportDiagnostic(program, {
        code: "protobuf-artifact-unavailable",
        messageId: "no-file",
        // The missing file belongs to the package, so the package declaration
        // is where the author has something to change.
        target: target.namespace,
        format: { name: model.name, package: identity },
      });
    }
    return undefined;
  }

  return { identity, text };
}

/**
 * Reports what the capture took off the program.
 *
 * The capture removes the diagnostics of its own invocation so that a project
 * running the official emitter itself does not see each message twice. That
 * removal must not throw the messages away. An error of the official emitter
 * is the actionable answer, and some of them name a namespace, an enum, or an
 * operation, which no artifact diagnostic covers.
 *
 * The messages are put back unless the emit list already runs the official
 * emitter. That invocation reports the same problems on its own.
 *
 * @param program - The program to report against
 * @param diagnostics - What the capture took off the program
 */
function reportCapturedDiagnostics(program: Program, diagnostics: readonly Diagnostic[]): void {
  if (diagnostics.length === 0) return;
  if (officialEmitterRunsItself(program)) return;
  program.reportDiagnostics(diagnostics);
}

/**
 * Says whether the project asked for the official Protobuf emitter too.
 *
 * An emit list holds either a package name or a path to one. Both forms end
 * with the package name.
 *
 * @param program - The compiled program
 * @returns Whether the official emitter runs in this compilation
 */
function officialEmitterRunsItself(program: Program): boolean {
  const emit = program.compilerOptions.emit ?? [];
  return emit.some((entry) => entry === OFFICIAL_EMITTER || entry.endsWith(`/${OFFICIAL_EMITTER}`));
}

/**
 * Finds out whether the official emitter skipped writing for the whole program.
 *
 * That emitter writes nothing on a dry run, on `noEmit`, and when the program
 * already has an error. One reason covers every model, so one answer replaces
 * a per-model message that would name the wrong cause.
 *
 * A capture that reported an error of its own is not a skip. Those models are
 * told what the official emitter refused, which is the better message.
 *
 * @param program - The compiled program
 * @param captured - The files and the diagnostics of the capture
 * @returns The reason, or `undefined` when the per-model answers apply
 */
function wholeEmitSkip(program: Program, captured: ProtobufCaptureResult): EmitSkip | undefined {
  if (captured.files.size > 0) return undefined;

  const options = program.compilerOptions;
  // Neither mode writes a document either, so there is nothing to explain.
  if (options.dryRun === true || options.noEmit === true) return { silent: true };

  if (captured.diagnostics.some((diagnostic) => diagnostic.severity === "error")) return undefined;
  if (program.hasError()) {
    return {
      silent: false,
      reason: "the program has errors, and that emitter writes nothing after one",
    };
  }
  return undefined;
}

/**
 * Returns the one artifact of a package, building it on first use.
 *
 * Every model of a package describes the same text. One object for all of
 * them lets a later stage tell two uses of one schema apart from two schemas.
 *
 * @param artifacts - The artifacts built so far, by package identity
 * @param identity - What the artifact calls itself
 * @param schema - The proto3 text of the whole package
 * @returns The artifact of that package
 */
function artifactOf(
  artifacts: Map<string, ExternalSchemaArtifact>,
  identity: string,
  schema: string,
): ExternalSchemaArtifact {
  const existing = artifacts.get(identity);
  if (existing !== undefined) return existing;

  const artifact: ExternalSchemaArtifact = {
    schemaFormat: PROTOBUF_SCHEMA_FORMAT,
    schema,
    provider: PROVIDER_ID,
    identity,
  };
  artifacts.set(identity, artifact);
  return artifact;
}

/**
 * Keys the captured text by the package name the text itself declares.
 *
 * A file with no `package` line comes from a package that declares no name,
 * and it is keyed by the empty string. The pinned official emitter reports a
 * collision and writes nothing when two packages would share a name, so a key
 * arrives at most once.
 *
 * That promise belongs to the pinned version, and this file exists because
 * the behavior of that version is not promised for the next one. A second,
 * different text under one key therefore throws. A wrong payload written in
 * silence is the one outcome this file has to prevent.
 *
 * @param files - The captured text, by the path it would have been written to
 * @returns The text of each package, by the name it declares
 * @throws When two captured files declare one package name with different text
 */
function textByPackageName(files: ReadonlyMap<string, string>): Map<string, string> {
  const texts = new Map<string, string>();
  for (const [path, text] of files) {
    const declared = PACKAGE_DECLARATION.exec(text)?.[1] ?? "";
    const existing = texts.get(declared);
    if (existing !== undefined && existing !== text) {
      const identity = declared === "" ? UNNAMED_PACKAGE_IDENTITY : declared;
      throw new Error(
        `The official Protobuf emitter produced two different files for package '${identity}', the second of them '${path}'. A model is matched to its package by that name, so this adapter cannot choose one.`,
      );
    }
    texts.set(declared, text);
  }
  return texts;
}

/**
 * Collects the models the official emitter reported an error about.
 *
 * An error means the official emitter could not convert what the author
 * wrote. It also stops that emitter from producing any file at all, so
 * without this the model would be told its package has no file.
 *
 * @param diagnostics - What the capture took off the program
 * @returns Every model an error names, directly or through a property
 */
function modelsTheOfficialEmitterRefused(diagnostics: readonly Diagnostic[]): Set<Model> {
  const refused = new Set<Model>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "error") continue;
    const model = modelOf(diagnostic.target);
    if (model !== undefined) refused.add(model);
  }
  return refused;
}

/**
 * Reads the model a diagnostic is about.
 *
 * A diagnostic can also name a syntax node or nothing at all. Both come back
 * as `undefined`, because neither says which model to hold back.
 *
 * @param target - What the diagnostic points at
 * @returns The model, or the model that holds the property, or `undefined`
 */
function modelOf(target: Diagnostic["target"]): Model | undefined {
  if (typeof target !== "object" || !("entityKind" in target) || target.entityKind !== "Type") {
    return undefined;
  }
  if (target.kind === "Model") return target;
  if (target.kind === "ModelProperty") return target.model;
  return undefined;
}
