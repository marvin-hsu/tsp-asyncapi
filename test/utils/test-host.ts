import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import type { Diagnostic, Program } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { buildAsyncAPIDocument } from "#emitter/pipeline.js";
import type { AsyncAPIDocument } from "#emitter/types/index.js";
import yaml from "yaml";

/**
 * Source for a test compilation. A string is the whole of `main.tsp`. A
 * record is a set of files, keyed by name, for a case that needs more than
 * one file. Behavior that depends on a declaration being spread across
 * files, such as a namespace opened in several of them, needs the record
 * form.
 */
export type TestSource = string | Record<string, string>;

/**
 * The name of the entry file of a test compilation.
 * The tester wraps this one file with the library import and the `using`
 * statement, and the compiler starts from it.
 */
const ENTRY_FILE = "main.tsp";

/**
 * Builds the tester for one source.
 *
 * A multi-file case declares every file it needs, and each of them is
 * imported from the entry file. The imports cannot be written in the entry
 * file itself, because the tester puts its own `using` statement above the
 * text this helper is given, and TypeSpec requires every import to come
 * first. The files are imported in the order the record lists them.
 *
 * @param code - The source of the compilation
 * @param options - The emitter options
 * @returns The tester to compile with
 */
function createTester(code: TestSource, options: Record<string, unknown>) {
  const tester = AsyncAPITester.emit(PACKAGE_NAME, options);
  if (typeof code === "string") return tester;
  const imports = Object.keys(code)
    .filter((name) => name !== ENTRY_FILE)
    .map((name) => `./${name}`);
  return imports.length > 0 ? tester.import(...imports) : tester;
}

/**
 * Compiles one source and hands back the text of the file the emitter wrote.
 *
 * Every other helper here is a few lines on top of this one. Three copies of
 * this logic used to exist: this file, and a hand-written `emitRaw` in each of
 * two integration suites. The option names that decide which file to read are
 * the part worth having in one place.
 *
 * @param code - The source of the compilation
 * @param options - The emitter options
 * @param includeService - Whether to wrap a single-file source in a service
 * @returns The emitted text, or undefined when the emitter wrote nothing
 */
async function emitOutput(
  code: TestSource,
  options: Record<string, unknown>,
  includeService: boolean,
) {
  // The service wrapper is only added to the single-file form. A multi-file
  // case declares its own service, since only its author knows which file
  // should hold it.
  const fullCode =
    typeof code === "string" && includeService && !code.includes("@service")
      ? `@service(#{ title: "TestService" }) namespace Test;\n${code}`
      : code;

  const [result, diagnostics] = await createTester(code, options).compileAndDiagnose(fullCode);

  const fileType = typeof options["file-type"] === "string" ? options["file-type"] : "yaml";
  const outputFileName =
    typeof options["output-file"] === "string" ? options["output-file"] : `asyncapi.${fileType}`;

  const outputs: Record<string, string | undefined> = result.outputs;
  return { content: outputs[outputFileName], fileType, diagnostics, program: result.program };
}

/**
 * Emits one source and parses the document, keeping every diagnostic.
 *
 * The program is returned alongside the document. Most cases read the document
 * alone, but a decorator that records state and emits nothing can only be
 * checked by reading that state back. A decorator that reports an error also
 * stops the emitter from running, so `doc` is null in that case and a caller
 * about diagnostics has to handle it.
 *
 * @param code - The source of the compilation
 * @param options - The emitter options
 * @param includeService - Whether to wrap a single-file source in a service
 * @returns The parsed document or null, every diagnostic, and the program
 */
export async function emitDocumentWithDiagnostics(
  code: TestSource,
  options: Record<string, unknown> = {},
  includeService = true,
): Promise<{
  doc: AsyncAPIDocument | null;
  diagnostics: readonly Diagnostic[];
  program: Program;
}> {
  const { content, fileType, diagnostics, program } = await emitOutput(
    code,
    options,
    includeService,
  );

  if (content === undefined) {
    return { doc: null, diagnostics, program };
  }

  // The parsers both return `any`, and this is the one place that says what
  // the text actually is. Every caller reads a typed document from here, so a
  // path that does not exist on `AsyncAPIDocument` is a compile error rather
  // than an `undefined` at run time.
  const parsed: unknown = fileType === "json" ? JSON.parse(content) : yaml.parse(content);
  return { doc: parsed as AsyncAPIDocument, diagnostics, program };
}

/**
 * Emits one source that is meant to compile clean, and returns its document.
 *
 * Two things are asserted before the document is handed back: the compilation
 * reported nothing, and the emitter wrote a file. Neither is a case a test
 * about document content should have to handle, and a null document reaching
 * such a test is a broken fixture rather than an outcome worth asserting on.
 *
 * @param code - The source of the compilation
 * @param options - The emitter options
 * @returns The parsed document
 */
export async function emitDocument(
  code: TestSource,
  options: Record<string, unknown> = {},
): Promise<AsyncAPIDocument> {
  const { doc, diagnostics } = await emitDocumentWithDiagnostics(code, options);
  expectDiagnosticEmpty(diagnostics);
  if (doc === null) {
    throw new Error(
      "The emitter wrote no output file, so there is no document to read. " +
        "A test that expects this should use emitDocumentWithDiagnostics.",
    );
  }
  return doc;
}

/**
 * Builds the document from a program the test compiled itself.
 *
 * The two arguments this fills in are the same at every call site: no explicit
 * service, and no emitter options. Spelled out, they were the longest
 * repetition in the suite and said nothing about the case under test.
 *
 * A test that needs to name the service, as the multiple-service cases do,
 * calls `buildAsyncAPIDocument` directly.
 *
 * @param program - The compiled program
 * @returns The built document
 */
export function documentFrom(program: Program): Promise<AsyncAPIDocument> {
  return buildAsyncAPIDocument(program, undefined, {});
}

/**
 * Builds a document from source without writing a file.
 *
 * `emitDocumentWithDiagnostics` goes through the emitter, and the emitter
 * writes nothing once an error is reported. So a test about an error cannot
 * use it to look at what the document still holds.
 *
 * A binding that leaves out a field its specification requires is exactly
 * that case. The diagnostic promises the one binding was dropped and the rest
 * of the document survived, and only the document itself can show that.
 *
 * The pipeline is called directly, so this is the `src` copy of the builder
 * rather than the build output. The decorators still run from `dist`, which
 * is where the compiler loads them from.
 *
 * @param code - The source of the compilation
 * @returns The built document and every diagnostic the compilation reported
 */
export async function buildAsyncAPIWithDiagnostics(code: string) {
  const runner = await AsyncAPITester.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code);
  return { doc: await documentFrom(runner.program), diagnostics };
}
