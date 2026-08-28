import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import type { Diagnostic } from "@typespec/compiler";
import { PACKAGE_NAME } from "#emitter/lib.js";
import type { AsyncAPIDocument } from "#emitter/types/index.js";
import yaml from "yaml";
import { createLibraryTester } from "./emitter-package.js";

/** The file the emitter writes with the default options. */
const OUTPUT_FILE = "asyncapi.yaml";

/** What one compilation produced. */
interface Emitted {
  /** The parsed document, or null when the emitter wrote nothing. */
  readonly doc: AsyncAPIDocument | null;
  /** Every diagnostic the compilation reported. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Runs one preview feature end to end and reads the file it wrote.
 *
 * Both members are written as properties rather than methods, because every
 * caller destructures them away from this object.
 */
export interface ArtifactEmitter {
  /** Compiles one source and parses whatever the emitter wrote. */
  readonly emit: (code: string) => Promise<Emitted>;
  /**
   * Reads the document of a case that is meant to compile clean.
   *
   * Clean means silent, not merely free of errors. A warning a case did not
   * expect is a behavior change worth failing on.
   */
  readonly emitClean: (code: string) => Promise<AsyncAPIDocument>;
}

/**
 * Builds an emitter for one schema artifact preview feature.
 *
 * The Avro and Protobuf payload suites share the same three steps: compile
 * with the schema library loaded and the feature on, read the one file the
 * emitter writes, and parse it. Only the library and the feature name differ.
 *
 * @param library - The schema library to load beside the emitter
 * @param feature - The preview feature to turn on
 */
export function createArtifactEmitter(library: string, feature: string): ArtifactEmitter {
  const tester = createLibraryTester(library).emit(PACKAGE_NAME, {
    "preview-features": [feature],
  });

  async function emit(code: string): Promise<Emitted> {
    const [result, diagnostics] = await tester.compileAndDiagnose(code);
    const outputs: Record<string, string | undefined> = result.outputs;
    const content = outputs[OUTPUT_FILE];
    if (content === undefined) return { doc: null, diagnostics };
    return { doc: yaml.parse(content) as AsyncAPIDocument, diagnostics };
  }

  return {
    emit,
    async emitClean(code: string): Promise<AsyncAPIDocument> {
      const { doc, diagnostics } = await emit(code);
      expectDiagnosticEmpty(diagnostics);
      if (doc === null) throw new Error("The emitter wrote no document for a clean compilation.");
      return doc;
    },
  };
}

/**
 * Reads the multi format payload of one message component.
 *
 * The schema is left as `unknown`: a format that is itself JSON is inlined as
 * an object, and one that is text arrives as a string.
 */
export function payloadOf(
  doc: AsyncAPIDocument,
  name: string,
): { schemaFormat: string; schema: unknown } {
  const payload = doc.components?.messages?.[name].payload;
  return payload as { schemaFormat: string; schema: unknown };
}

/** Reads a payload whose schema is text, such as proto3. */
export function textPayloadOf(
  doc: AsyncAPIDocument,
  name: string,
): { schemaFormat: string; schema: string } {
  const payload = payloadOf(doc, name);
  return { schemaFormat: payload.schemaFormat, schema: payload.schema as string };
}
