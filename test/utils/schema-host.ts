import { Model } from "@typespec/compiler";
import { TemplateWithMarkers } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { SchemaBuilder } from "../../src/lower/schemas.js";

/**
 * A `t.code` template, whatever types it marks. The argument has to be
 * `any`, matching the compiler's own `compile` signature. A narrower
 * `Record<string, Entity>` makes a concrete template fail the constraint,
 * and the marked types then infer as `{}`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkedTemplate = TemplateWithMarkers<any>;

/**
 * Compiles `code` and returns a fresh `SchemaBuilder` for it, alongside
 * everything the compiler's own test result carries: the program, and each
 * type the code marked. Use it in place of the create-instance / compile /
 * new-builder opening that a schema test would otherwise repeat. The
 * caller decides which marked type to build.
 *
 * @param code - The TypeSpec source, with a marker per type to return
 * @returns The builder, plus the whole compile result
 */
export async function compileSchemas<T extends MarkedTemplate>(code: T) {
  const runner = await AsyncAPITester.createInstance();
  const result = await runner.compile(code);
  // The compile result already carries `program`, so only the builder is
  // added here.
  return { builder: new SchemaBuilder(runner.program), ...result };
}

/**
 * Compiles `code` and hands back its diagnostics instead of asserting there
 * are none. Use it when the source under test is expected to produce one.
 *
 * `#deprecated` is the case this exists for. The compiler reports a warning
 * at every use site of a deprecated declaration, so a test that emits one
 * cannot go through `compileSchemas`.
 *
 * @param code - The TypeSpec source, with a marker per type to return
 * @returns The builder and the compile result, plus the diagnostics
 */
export async function compileSchemasWithDiagnostics<T extends MarkedTemplate>(code: T) {
  const runner = await AsyncAPITester.createInstance();
  const [result, diagnostics] = await runner.compileAndDiagnose(code);
  return { builder: new SchemaBuilder(runner.program), diagnostics, ...result };
}

/**
 * Compiles `code` (which must mark a model named `M`) and immediately
 * builds the schema of `M`. Use it when a test only needs the schema of
 * one model, which is the common case in the documentation and validation
 * tests.
 *
 * @param code - The TypeSpec source, which must mark a model named `M`
 * @returns The builder, plus the whole compile result
 */
export async function buildDocSchema<T extends MarkedTemplate & TemplateWithMarkers<{ M: Model }>>(
  code: T,
) {
  const context = await compileSchemas(code);
  context.builder.buildSchema(context.M);
  return context;
}
