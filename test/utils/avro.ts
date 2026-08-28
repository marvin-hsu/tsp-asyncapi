/**
 * The Avro test harness.
 *
 * It compiles a source with the Avro emitter and hands back the files it
 * wrote. It then runs each file past `avsc`, the reference Avro
 * implementation. `avsc` judges a schema in two ways: acceptance and
 * instance round trip.
 *
 * Acceptance proves the schema is legal Avro: `Type.forSchema` builds a type,
 * or it throws. Round trip proves the schema is usable: a random instance of
 * the type survives an encode and a decode. Round trip is the layer worth
 * having, because a schema can be legal and still describe nothing anyone
 * can write.
 *
 * There is no third way. `Type.schema()` looks like a normalizer and is not
 * one: it drops `logicalType` and folds the namespace into the name, and
 * `avsc` accepts a logical type nobody has ever defined. So the namespace
 * shape, the key order, and every logical type are pinned by hand-written
 * expected values in the tests that own them.
 */

import avro from "avsc";
import { expect } from "vitest";
import { AvroTester } from "#avro/testing.js";
import { $onEmit } from "#avro/emitter.js";
import type { AvroEmitterOptions } from "#avro/lib.js";
import { listRecords } from "#avro/index.js";
import type { Diagnostic, EmitContext, Model, Program } from "@typespec/compiler";

/**
 * What one compile produced.
 */
export interface AvroEmitResult {
  /** Every file the emitter wrote, by path relative to the output directory. */
  readonly files: Record<string, unknown>;
  /** The raw text of every file, by the same path. */
  readonly texts: Record<string, string>;
  /** Everything the compiler and the emitter reported. */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Where the emitter is told to write.
 *
 * The tester writes into a virtual host, and nothing here reaches the disk.
 * The prefix is trimmed off every path, which leaves the path the emitter
 * chose, and that is the part a test is about.
 */
const OUTPUT_DIR = "/out";

function trimPrefix(path: string): string {
  const prefix = `${OUTPUT_DIR}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Compiles a source and runs the emitter over it.
 *
 * The compiler loads the decorators from the build output, because
 * `lib/main.tsp` says so. The emitter is called from the source instead, and
 * on purpose: that is the copy the coverage report is about, and it is the
 * copy a test author is editing. What the compiler resolves and runs is
 * proved separately, by the one test that goes through `Tester.emit`.
 *
 * @param source - The TypeSpec source. It is compiled with the `Avro`
 *   namespace already in scope.
 * @returns The files, their text, and the diagnostics
 */
export async function emitAvro(source: string): Promise<AvroEmitResult> {
  const runner = await AvroTester.createInstance();
  await runner.diagnose(source);
  const program = runner.program;

  const texts: Record<string, string> = {};
  const host = program.host;
  const write = host.writeFile.bind(host);
  host.writeFile = async (path: string, content: string): Promise<void> => {
    texts[trimPrefix(path)] = content;
    await write(path, content);
  };

  await $onEmit({
    program,
    emitterOutputDir: OUTPUT_DIR,
    options: {},
  } as EmitContext<AvroEmitterOptions>);

  const files: Record<string, unknown> = {};
  for (const [path, text] of Object.entries(texts)) {
    files[path] = JSON.parse(text);
  }

  return { files, texts, diagnostics: program.diagnostics };
}

/**
 * Compiles a source that has to succeed, and returns its files.
 *
 * A diagnostic here means the test source is wrong, not that the assertion
 * below it failed. Failing on the spot says which of the two happened.
 *
 * Every file goes past `avsc` before it is handed back, so a test gets the
 * acceptance layer whether or not its author asked for it. A wrong primitive
 * name or a reference to a name nothing defines fails here, in the test that
 * produced it. The round trip layer is not run here, because a record that
 * reaches itself through a plain field makes `random` recurse until the stack
 * runs out; those tests call `expectValueRoundTrip` with an instance instead.
 *
 * @param source - The TypeSpec source
 * @returns The parsed files, by path relative to the output directory
 */
export async function emitAvroFiles(source: string): Promise<Record<string, unknown>> {
  const result = await emitAvro(source);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
  for (const schema of Object.values(result.files)) {
    acceptSchema(schema);
  }
  return result.files;
}

/**
 * Asserts that `avsc` accepts a schema, and returns the type it built.
 *
 * @param schema - One parsed `.avsc` file
 * @returns The Avro type
 */
export function acceptSchema(schema: unknown): avro.Type {
  return avro.Type.forSchema(schema as avro.Schema);
}

/**
 * Asserts that a random instance of the schema survives a buffer round trip.
 *
 * `random` builds a value the schema allows, so this drives whatever the
 * schema says, not whatever a test author thought of. It runs several times
 * because one random instance can miss a branch: an array can come back
 * empty, and an enum lands on one symbol.
 *
 * The generated value is checked against the schema, and the decoded value is
 * then encoded again and compared. Comparing the first decode with the
 * generated value would be wrong for one Avro type: `float` is four bytes on
 * the wire, `random` hands out a JavaScript double, and 818.6408281326294
 * comes back as 818.6408081054688. That is the Avro specification working,
 * not the emitter failing. Encoding twice is the property that holds for
 * every type: what the schema wrote out is what the schema reads back.
 *
 * @param schema - One parsed `.avsc` file
 * @param rounds - How many random instances to try
 */
export function expectInstanceRoundTrip(schema: unknown, rounds = 20): void {
  const type = acceptSchema(schema);
  for (let round = 0; round < rounds; round++) {
    const value: unknown = type.random();
    expect(type.isValid(value)).toBe(true);

    const decoded: unknown = type.fromBuffer(type.toBuffer(value));
    expect(type.fromBuffer(type.toBuffer(decoded))).toEqual(decoded);
  }
}

/**
 * One field of a rendered record, as a test reads it.
 *
 * `type` stays unknown because it is either a string or a nested schema, and
 * which one it is is exactly what several tests are about.
 */
export interface RenderedField {
  readonly name: string;
  readonly type: unknown;
  readonly doc?: string;
  /** The default, which is absent unless the schema wrote one. Null is one. */
  readonly default?: unknown;
}

/**
 * Reads the fields of a rendered record.
 *
 * @param schema - One parsed `.avsc` file, or a nested record inside one
 * @returns Its fields, in the order they were written
 */
export function recordFields(schema: unknown): RenderedField[] {
  const fields = (schema as { fields?: RenderedField[] }).fields;
  if (fields === undefined) {
    throw new Error(`The schema has no fields: ${JSON.stringify(schema)}`);
  }
  return fields;
}

/**
 * Reads one field of a rendered record by name.
 *
 * @param schema - One parsed `.avsc` file, or a nested record inside one
 * @param name - The field name
 * @returns That field
 */
export function fieldNamed(schema: unknown, name: string): RenderedField {
  const field = recordFields(schema).find((one) => one.name === name);
  if (field === undefined) {
    throw new Error(`The schema has no field named '${name}'.`);
  }
  return field;
}

/**
 * Asserts that one instance the caller wrote survives a buffer round trip.
 *
 * Use this where `random` cannot terminate, and where a chosen instance says
 * more than a random one. A record that reaches itself through a plain field
 * has no branch that stops, so `random` recurses until the stack runs out.
 * That is a limit of the generator, not of the schema. A record that reaches
 * itself through an optional field does stop, because null is a branch, but
 * it stops at a depth nobody picked. A written instance names the depth.
 *
 * @param schema - One parsed `.avsc` file
 * @param value - An instance the schema allows
 */
export function expectValueRoundTrip(schema: unknown, value: unknown): void {
  const type = acceptSchema(schema);
  expect(type.fromBuffer(type.toBuffer(value))).toEqual(value);
}

/**
 * Compiles one source with the Avro library loaded and no emitter run.
 *
 * This is what a caller of the walk sees: the decorators have written their
 * state and nothing else has happened. A caller that wants the files runs
 * `emitAvro` instead.
 *
 * @param source - The TypeSpec source, which must carry the Avro decorators
 * @returns The compiled program
 */
export async function compileAvro(source: string): Promise<Program> {
  const runner = await AvroTester.createInstance();
  await runner.diagnose(source);
  return runner.program;
}

/**
 * Finds one `@Avro.avroRecord` model by name.
 *
 * @param program - The compiled program
 * @param modelName - The name the source gives the model
 * @returns That model
 */
export function avroModelNamed(program: Program, modelName: string): Model {
  const model = listRecords(program).find((one) => one.name === modelName);
  if (model === undefined) {
    throw new Error(`The source declares no @Avro.avroRecord model named '${modelName}'.`);
  }
  return model;
}
