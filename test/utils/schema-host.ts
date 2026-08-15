import { Entity, Model, Program } from "@typespec/compiler";
import { TemplateWithMarkers } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { SchemaBuilder } from "../../src/builders/schemas/builder.js";

/**
 * Compiles `code` (which must produce a model named `M`) and immediately
 * builds its schema. It returns the builder and the program alongside the
 * full compile result, so a test can still reach any other symbol it
 * marked. Shared by the schema tests, which otherwise all repeat the same
 * four-line create-instance / compile / new-builder / build-schema setup.
 *
 * The program is returned rather than the tester instance. The tester type
 * cannot be named from outside the compiler package, and `program` is the
 * only member the callers use.
 */
export async function buildDocSchema<T extends Record<string, Entity> & { M: Model }>(
  code: TemplateWithMarkers<T>,
): Promise<{ builder: SchemaBuilder; program: Program } & T> {
  const runner = await AsyncAPITester.createInstance();
  const result = await runner.compile(code);
  const builder = new SchemaBuilder(runner.program);
  builder.buildSchema(result.M);
  return { builder, ...result, program: runner.program };
}
