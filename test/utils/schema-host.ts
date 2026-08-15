import { Model } from "@typespec/compiler";
import { TemplateWithMarkers, TestCompileResult } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { SchemaBuilder } from "../../src/builders/schemas/builder.js";

/**
 * A `t.code` template, whatever types it marks. The argument has to be
 * `any`, matching the compiler's own `compile` signature. A narrower
 * `Record<string, Entity>` makes a concrete template fail the constraint,
 * and the marked types then infer as `{}`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MarkedTemplate = TemplateWithMarkers<any>;

/**
 * Extracts the marked types out of a `t.code` template. It mirrors the
 * compiler's own `GetMarkedEntities`, which the testing entrypoint does
 * not export. The whole template has to be the type parameter for this to
 * work. Declaring the parameter as `TemplateWithMarkers<T>` and inferring
 * `T` directly does not work, because `T` only reaches the interface
 * through a mapped type.
 */
type MarkedEntities<T> = T extends TemplateWithMarkers<infer R> ? R : never;

/**
 * What a schema test gets back: a builder, plus everything the compiler's
 * own test result carries. That result names each marked type precisely.
 * It also carries a catch-all index, which is how a type named by a
 * `@test("...")` decorator rather than by a marker stays reachable.
 */
type SchemaTestContext<T> = { builder: SchemaBuilder } & TestCompileResult<MarkedEntities<T>>;

/**
 * Compiles `code` and returns a fresh `SchemaBuilder` for it, alongside
 * every type the code marked. Use it in place of the create-instance /
 * compile / new-builder opening that a schema test would otherwise repeat.
 * The caller decides which marked type to build.
 *
 * The program is returned rather than the tester instance. The tester type
 * cannot be named from outside the compiler package, and `program` is the
 * only member the callers use.
 *
 * @param code - The TypeSpec source, with a marker per type to return
 * @returns The builder, the program, and every marked type
 */
export async function compileSchemas<T extends MarkedTemplate>(
  code: T,
): Promise<SchemaTestContext<T>> {
  const runner = await AsyncAPITester.createInstance();
  const result = await runner.compile(code);
  // The compile result already carries `program`, so only the builder is
  // added here.
  //
  // The cast is needed because `MarkedEntities` and the compiler's own
  // `GetMarkedEntities` are two separate deferred conditional types. They
  // compute the same thing, but TypeScript cannot prove that while `T` is
  // still generic. The compiler does not export its version, so the
  // duplicate cannot be avoided.
  //
  // ESLint reads the two as the same type and calls the cast redundant.
  // `tsc` does not, and it fails without the cast, so the rule is off here.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return {
    builder: new SchemaBuilder(runner.program),
    ...result,
  } as unknown as SchemaTestContext<T>;
}

/**
 * Compiles `code` (which must mark a model named `M`) and immediately
 * builds the schema of `M`. Use it when a test only needs the schema of
 * one model, which is the common case in the documentation and validation
 * tests.
 *
 * @param code - The TypeSpec source, which must mark a model named `M`
 * @returns The builder, the program, and every marked type
 */
export async function buildDocSchema<T extends MarkedTemplate & TemplateWithMarkers<{ M: Model }>>(
  code: T,
): Promise<SchemaTestContext<T>> {
  const context = await compileSchemas(code);
  context.builder.buildSchema(context.M);
  return context;
}
