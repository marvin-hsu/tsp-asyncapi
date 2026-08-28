import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import type { Diagnostic, Program } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { buildAsyncAPIDocument } from "#emitter/pipeline.js";
import type { AsyncAPIDocument } from "#emitter/types/index.js";
import yaml from "yaml";

/**
 * Source for a test compilation. A string is the whole of `main.tsp`. A
 * record is a set of files, keyed by name, for a case where a declaration
 * spans files, such as a namespace opened in more than one of them.
 */
export type TestSource = string | Record<string, string>;

/**
 * The entry file of a test compilation. The tester wraps it with the
 * library import and the `using` statement, and the compiler starts here.
 */
const ENTRY_FILE = "main.tsp";

/**
 * Builds the tester for one source.
 *
 * A multi-file case imports every extra file from the entry file, in the
 * order the record lists them. The imports cannot live in the entry file's
 * own text, because the tester's `using` statement goes above it and
 * TypeSpec requires every import to come first.
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
 * Every other helper here builds on this one. The option names that decide
 * which output file to read are the part worth keeping in one place.
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
  // Only a single-file source gets this wrapper added. A multi-file case
  // must declare its own service, since only its author knows which file
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
 * The program comes back alongside the document, because a decorator that
 * only records state needs it read back directly. An error also stops the
 * emitter, so `doc` is null then, and a caller checking diagnostics must
 * handle that.
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

  // Both parsers return `any`. This is the one place that names the real
  // type, so every caller reads a typed document from here. A path missing
  // from `AsyncAPIDocument` is then a compile error, not an `undefined` at
  // run time.
  const parsed: unknown = fileType === "json" ? JSON.parse(content) : yaml.parse(content);
  return { doc: parsed as AsyncAPIDocument, diagnostics, program };
}

/**
 * Emits one source that is meant to compile clean, and returns its document.
 *
 * This asserts the compilation reported nothing and the emitter wrote a
 * file, so a test about document content never has to check either. A null
 * document reaching such a test means a broken fixture, not a real outcome.
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
 * Fills in the two arguments that are the same at every call site: no
 * explicit service and no emitter options. Spelled out, they were the
 * longest repetition in the suite and said nothing about the case under
 * test.
 *
 * A test that needs to name the service calls `buildAsyncAPIDocument`
 * directly.
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
 * The emitter writes nothing once an error is reported, so a test about an
 * error cannot use `emitDocumentWithDiagnostics` to see what the document
 * still holds.
 *
 * A binding missing a field its specification requires is exactly that
 * case. The diagnostic promises the binding was dropped and the rest of
 * the document survived, and only the document itself can confirm that.
 *
 * This calls the pipeline directly, so it runs the `src` copy of the
 * builder. The decorators still run from `dist`, which is where the
 * compiler loads them from.
 *
 * @param code - The source of the compilation
 * @returns The built document and every diagnostic the compilation reported
 */
export async function buildAsyncAPIWithDiagnostics(code: string) {
  const runner = await AsyncAPITester.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code);
  return { doc: await documentFrom(runner.program), diagnostics };
}
