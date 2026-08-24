/**
 * Turning captured `.proto` text into artifacts, one per model.
 *
 * The capture gives back the text of every file the official emitter would
 * have written, keyed by its path. This step decides which model each text
 * describes.
 *
 * The decision never comes from a file name or from a message of the same name
 * inside the text. It comes from the official decorator state: each
 * `@Protobuf.message` model resolves to its nearest `@Protobuf.package`
 * namespace, and that package name is matched against the `package`
 * declaration the text carries. So a renamed package, a nested namespace, and
 * two packages that hold a model of one name all map correctly.
 *
 * A model of a package is described by the whole package text, not by the one
 * message inside it. The syntax line, the imports, the enums, and every
 * message a field refers to are all part of the schema. So every model of one
 * package gets one artifact, and they share it.
 *
 * Nothing here falls back to an empty payload. A model with no package, a
 * package with no captured file, and a model the official emitter refused all
 * report a diagnostic instead.
 */

import type { Diagnostic, Model, Program } from "@typespec/compiler";
import {
  reportDiagnostic,
  type ExternalSchemaArtifact,
  type SchemaArtifactIndex,
} from "tsp-asyncapi-core";
import type { ProtobufCaptureResult } from "./protobuf-capture.js";
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

/** What the identity of an artifact says for a package that declares no name. */
const UNNAMED_PACKAGE_IDENTITY = "(no package name)";

/** The `package` declaration of a proto file, which the text carries at most once. */
const PACKAGE_DECLARATION = /^package\s+([^\s;]+)\s*;/m;

/**
 * Builds the artifact index of one capture.
 *
 * @param program - The program the capture ran over, to report against
 * @param captured - The files and the diagnostics of the capture
 * @returns The payload artifact of every model that got one
 * @internal
 */
export function indexProtobufArtifacts(
  program: Program,
  captured: ProtobufCaptureResult,
): SchemaArtifactIndex {
  const texts = textByPackageName(captured.files);
  const refused = modelsTheOfficialEmitterRefused(captured.diagnostics);
  const artifacts = new Map<string, ExternalSchemaArtifact>();
  const payloadFor = new Map<Model, ExternalSchemaArtifact>();

  for (const model of listProtobufMessageModels(program)) {
    const target = resolveProtobufPackage(program, model);
    if (target === undefined) {
      reportDiagnostic(program, {
        code: "protobuf-artifact-unavailable",
        messageId: "no-package",
        target: model,
        format: { name: model.name },
      });
      continue;
    }

    const identity = target.name ?? UNNAMED_PACKAGE_IDENTITY;
    if (refused.has(model)) {
      reportDiagnostic(program, {
        code: "protobuf-artifact-unavailable",
        messageId: "not-converted",
        target: model,
        format: { name: model.name, package: identity },
      });
      continue;
    }

    const text = texts.get(target.name ?? "");
    if (text === undefined) {
      reportDiagnostic(program, {
        code: "protobuf-artifact-unavailable",
        messageId: "no-file",
        target: model,
        format: { name: model.name, package: identity },
      });
      continue;
    }

    payloadFor.set(model, artifactOf(artifacts, identity, text));
  }

  return { payloadFor, headersFor: new Map() };
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
 * and it is keyed by the empty string. The official emitter reports a
 * collision and writes nothing when two packages would share a name, so a key
 * arrives at most once. The first text of a key is kept if that ever changes.
 *
 * @param files - The captured text, by the path it would have been written to
 * @returns The text of each package, by the name it declares
 */
function textByPackageName(files: ReadonlyMap<string, string>): Map<string, string> {
  const texts = new Map<string, string>();
  for (const text of files.values()) {
    const declared = PACKAGE_DECLARATION.exec(text)?.[1] ?? "";
    if (!texts.has(declared)) texts.set(declared, text);
  }
  return texts;
}

/**
 * Collects the models the official emitter reported an error about.
 *
 * An error means the official emitter could not convert what the author
 * wrote. It also stops that emitter from producing any file at all, so
 * without this the model would be told its package has no file. The error
 * itself is the actionable answer, and this keeps the diagnostic pointed at
 * it.
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
