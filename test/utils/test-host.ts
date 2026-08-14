/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { LIBRARY_NAME } from "../../src/lib.js";
import yaml from "yaml";

export async function emitAsyncAPIWithDiagnostics(
  code: string,
  options: Record<string, unknown> = {},
  includeService = true,
) {
  const fullCode =
    includeService && !code.includes("@service")
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

export async function emitAsyncAPI(code: string, options: Record<string, unknown> = {}) {
  const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(code, options);
  expectDiagnosticEmpty(diagnostics);
  return doc;
}
