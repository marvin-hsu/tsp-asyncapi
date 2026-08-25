/**
 * The parity oracle for generated Protobuf payloads.
 *
 * This emitter renders proto3 text itself. So the one risk that matters is
 * drift: our mapping of a TypeSpec type says one thing, and the official
 * Protobuf library says another. A test that only reads our own output cannot
 * see that.
 *
 * So a parity case compiles one source twice. One compile is the run time
 * path: the official decorators write their state, and this emitter walks
 * that state and renders. The other compile runs the official emitter and
 * keeps the `.proto` file it wrote. The official emitter appears here and
 * nowhere else, which is why it is a development dependency.
 *
 * Both texts are then parsed, and the two descriptors are compared. The
 * comparison is about meaning: types, field numbers, labels, names, and
 * nesting. Comments and layout are not part of it, because two texts that
 * describe one wire format are equal for every consumer of the document.
 */

import { getDirectoryPath, normalizePath } from "@typespec/compiler";
import { createTester } from "@typespec/compiler/testing";
import { fileURLToPath } from "node:url";
import { parse as parseProto, Root as ProtoRoot } from "protobufjs";
import { expect } from "vitest";
import type { Diagnostic, Model, Program } from "@typespec/compiler";
import { buildPayloadModel } from "#emitter/schema-artifacts/protobuf/model.js";
import { renderProtoFile } from "#emitter/schema-artifacts/protobuf/render.js";
import { listProtobufMessageModels } from "#emitter/schema-artifacts/protobuf/state.js";

/**
 * The emitter package root, which is where the testers resolve libraries
 * from. `@typespec/protobuf` is a development dependency of that package, so
 * the resolution has to start there and not at the workspace root.
 */
const EMITTER_PACKAGE_ROOT = normalizePath(
  getDirectoryPath(getDirectoryPath(getDirectoryPath(fileURLToPath(import.meta.url)))) +
    "/packages/tsp-asyncapi",
);

/** The libraries every parity case compiles against. */
const LIBRARIES = ["tsp-asyncapi", "@typespec/protobuf"];

/**
 * The tester of the run time path. It loads the official library so the
 * decorators exist, and it runs no emitter at all.
 */
const StateTester = createTester(EMITTER_PACKAGE_ROOT, { libraries: LIBRARIES })
  .importLibraries()
  .using("AsyncAPI");

/** The tester of the judge. Same source, and the official emitter runs. */
const OfficialTester = StateTester.emit("@typespec/protobuf");

/**
 * Parses proto3 text into a descriptor.
 *
 * Names are kept as the text spells them. The parser would otherwise rewrite
 * a field name into camel case, and a naming difference between the two texts
 * would then be invisible here.
 *
 * The descriptor tree carries no syntax version, so the caller checks that
 * separately. A proto2 file and a proto3 file mean different things for the
 * same fields.
 *
 * @param text - The proto3 text to parse
 * @returns The descriptor of that text
 */
export function descriptorOf(text: string): unknown {
  return parseProto(text, new ProtoRoot(), { keepCase: true }).root.toJSON();
}

/**
 * Compiles a source and renders the payload of one model with this emitter.
 *
 * @param source - The TypeSpec source, which must carry the official
 *   decorators
 * @param modelName - The model to render the payload of
 * @returns The proto3 text this emitter produced
 */
export async function renderPayload(source: string, modelName: string): Promise<string> {
  const runner = await StateTester.createInstance();
  await runner.compile(source);
  return renderNamed(runner.program, modelName);
}

/**
 * Renders the payload of one model of an already compiled program.
 *
 * @param program - The compiled program
 * @param modelName - The model to render the payload of
 * @returns The proto3 text this emitter produced
 */
function renderNamed(program: Program, modelName: string): string {
  const model = messageModelNamed(program, modelName);
  const payload = buildPayloadModel(program, model);
  if (payload === undefined) {
    throw new Error(`This emitter refused a payload for '${modelName}'.`);
  }
  return renderProtoFile(payload);
}

/**
 * Finds one `@Protobuf.message` model by name.
 *
 * @param program - The compiled program
 * @param modelName - The name the source gives the model
 * @returns That model
 */
function messageModelNamed(program: Program, modelName: string): Model {
  const model = listProtobufMessageModels(program).find((one) => one.name === modelName);
  if (model === undefined) {
    throw new Error(`The source declares no @Protobuf.message model named '${modelName}'.`);
  }
  return model;
}

/**
 * Compiles a source with the official emitter and returns the file it wrote.
 *
 * A parity source declares one package, so the emitter writes one file. More
 * than one file means the source stopped being a parity source, and that is
 * an error rather than a choice of which file to read.
 *
 * @param source - The same TypeSpec source the run time path compiled
 * @returns The proto3 text the official emitter wrote
 */
export async function emitOfficialProto(source: string): Promise<string> {
  const result = await OfficialTester.compile(source);
  const files = Object.entries(result.outputs);
  if (files.length !== 1) {
    throw new Error(
      `The official emitter wrote ${String(files.length)} files: ${Object.keys(result.outputs).join(", ")}.`,
    );
  }
  return files[0][1];
}

/**
 * Asserts that this emitter and the official one describe the same thing.
 *
 * @param source - The TypeSpec source both sides compile
 * @param modelName - The model whose payload is compared. Its closure has to
 *   be the whole package, which is what makes the two texts comparable.
 */
export async function expectDescriptorParity(source: string, modelName: string): Promise<void> {
  const ourText = await renderPayload(source, modelName);
  const officialText = await emitOfficialProto(source);

  // The descriptor tree says nothing about the syntax version, and the same
  // field means different things under proto2 and proto3.
  expect(ourText).toContain('syntax = "proto3";');
  expect(officialText).toContain('syntax = "proto3";');

  expect(descriptorOf(ourText)).toStrictEqual(descriptorOf(officialText));
}

/**
 * Compiles a source and asserts this emitter refuses a payload for one model.
 *
 * Every walk that stops has to stop the same way: it reports, and it yields
 * nothing. A walk that returned a partial payload would put proto3 text in
 * the document that no consumer can decode, and say so nowhere.
 *
 * @param source - The TypeSpec source, which compiles without an error
 * @param modelName - The model whose payload is asked for
 * @returns The diagnostics the refusal reported
 */
export async function refusePayload(
  source: string,
  modelName: string,
): Promise<readonly Diagnostic[]> {
  const runner = await StateTester.createInstance();
  await runner.compile(source);
  const model = messageModelNamed(runner.program, modelName);
  expect(buildPayloadModel(runner.program, model)).toBeUndefined();
  return runner.program.diagnostics;
}
