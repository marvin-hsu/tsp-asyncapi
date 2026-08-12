/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-return */
import {
  createTestHost,
  createTestWrapper,
  expectDiagnosticEmpty,
  StandardTestLibrary,
} from "@typespec/compiler/testing";
import { AsyncAPITestLibrary, createAsyncAPITestRunner } from "../src/testing/index.js";
import { AsyncAPIEmitterOptions } from "../src/lib.js";
import yaml from "yaml";

export async function emitAsyncAPIWithDiagnostics(
  code: string,
  options: Record<string, any> = {},
  includeService = true,
) {
  const { host, runner } = await createAsyncAPITestRunner();
  const fullCode =
    includeService && !code.includes("@service")
      ? `@service(#{ title: "TestService" }) namespace Test;\n${code}`
      : code;

  const diagnostics = await runner.diagnose(fullCode, {
    noEmit: false,
    options: { "typespec-asyncapi": options as any },
  });

  const outputDir = runner.fs.get("tsp-output/typespec-asyncapi");
  const fileType = options["file-type"] || "yaml";
  const outputFileName = options["output-file"] || `asyncapi.${fileType}`;
  const outPath = `/test/typespec-asyncapi/${outputFileName}`;

  const content = runner.fs.get(outPath);
  if (!content) {
    return { doc: null, diagnostics };
  }

  const doc = fileType === "json" ? JSON.parse(content) : yaml.parse(content);
  return { doc, diagnostics };
}

export async function emitAsyncAPI(code: string, options: Record<string, any> = {}) {
  const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(code, options);
  expectDiagnosticEmpty(diagnostics);
  return doc;
}
