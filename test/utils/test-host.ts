/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { LIBRARY_NAME } from "../../src/lib.js";
import yaml from "yaml";

/**
 * Source for a test compilation. A string is the whole of `main.tsp`. A
 * record is a set of files, keyed by name, for a case that needs more than
 * one file. Behavior that depends on a declaration being spread across
 * files, such as a namespace opened in several of them, needs the record
 * form.
 */
export type TestSource = string | Record<string, string>;

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

  const [result, diagnostics] = await AsyncAPITester.emit(LIBRARY_NAME, options).compileAndDiagnose(
    fullCode,
  );

  const fileType = typeof options["file-type"] === "string" ? options["file-type"] : "yaml";
  const outputFileName =
    typeof options["output-file"] === "string" ? options["output-file"] : `asyncapi.${fileType}`;

  const content = result.outputs[outputFileName];
  if (!content) {
    return { doc: null, diagnostics };
  }

  return {
    doc: fileType === "json" ? JSON.parse(content) : yaml.parse(content),
    diagnostics,
  };
}

export async function emitAsyncAPI(code: TestSource, options: Record<string, unknown> = {}) {
  const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(code, options);
  expectDiagnosticEmpty(diagnostics);
  return doc;
}
