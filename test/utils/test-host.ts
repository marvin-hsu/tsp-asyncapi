/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { LIBRARY_NAME } from "../../src/lib.js";
import { buildAsyncAPIDocument } from "../../src/pipeline.js";
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
  const tester = AsyncAPITester.emit(LIBRARY_NAME, options);
  if (typeof code === "string") return tester;
  const imports = Object.keys(code)
    .filter((name) => name !== ENTRY_FILE)
    .map((name) => `./${name}`);
  return imports.length > 0 ? tester.import(...imports) : tester;
}

export async function emitAsyncAPIWithDiagnostics(
  code: TestSource,
  options: Record<string, unknown> = {},
  includeService = true,
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

  // The program is returned alongside the document. Most cases read the
  // document alone, but a decorator that records state and emits nothing can
  // only be checked by reading that state back. A decorator that reports an
  // error also stops the emitter from running, so there is no document to
  // read in that case either.
  const content = result.outputs[outputFileName];
  if (!content) {
    return { doc: null, diagnostics, program: result.program };
  }

  return {
    doc: fileType === "json" ? JSON.parse(content) : yaml.parse(content),
    diagnostics,
    program: result.program,
  };
}

export async function emitAsyncAPI(code: TestSource, options: Record<string, unknown> = {}) {
  const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(code, options);
  expectDiagnosticEmpty(diagnostics);
  return doc;
}

/**
 * Builds a document from source without writing a file.
 *
 * `emitAsyncAPIWithDiagnostics` goes through the emitter, and the emitter
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
  return { doc: buildAsyncAPIDocument(runner.program, undefined, {}), diagnostics };
}
