/**
 * One compile speaks with one voice about a record Avro refuses.
 *
 * A project that wants Avro files and an AsyncAPI document runs two emitters
 * over one program. Both reach the same walk. If both reported what that walk
 * refused, the author would read every reason twice, and a project that runs
 * only this emitter would read codes of a library it never put in `emit`.
 *
 * The walk collects rather than reports, so each library decides for itself.
 * The Avro emitter reports under its own codes because a user asked it to
 * emit. This provider reports under its own code because a user asked it to.
 * Neither repeats the other.
 *
 * Both emitters are called by hand here. A tester runs one emitter, and this
 * case is about what two of them do to one program.
 */

import { describe, expect, it } from "vitest";
import { createTester } from "@typespec/compiler/testing";
import type { EmitContext, Program } from "@typespec/compiler";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME } from "#emitter/lib.js";
import { $onEmit as emitAsyncAPI } from "#emitter/emitter.js";
import type { AsyncAPIEmitterOptions } from "#emitter/emitter-options.js";
import { $onEmit as emitAvro } from "#avro/emitter.js";
import type { AvroEmitterOptions } from "#avro/lib.js";

/** The root of the emitter package, which holds the Avro library beside it. */
const PACKAGE_ROOT = fileURLToPath(
  new URL("../../../../../packages/tsp-asyncapi", import.meta.url),
);

/** A tester that compiles both libraries and runs no emitter of its own. */
const BothLibraries = createTester(PACKAGE_ROOT, {
  libraries: [PACKAGE_NAME, "tsp-avro"],
})
  .importLibraries()
  .using("AsyncAPI");

/** A message model the Avro walk refuses, for one reason. */
const REFUSED = `
  @service(#{ title: "Orders" })
  namespace Test;

  @Avro.\`namespace\`("com.example.orders")
  namespace Test.Orders {
    @message
    @Avro.\`record\`
    model OrderPlaced {
      anything: unknown;
    }
  }

  @channel("orders.placed")
  interface Placed {
    @send
    op placed(event: Test.Orders.OrderPlaced): void;
  }
`;

/**
 * Compiles a source and returns the program, with no emitter run yet.
 *
 * @param code - The TypeSpec source of the case
 * @returns The compiled program
 */
async function compile(code: string): Promise<Program> {
  const runner = await BothLibraries.createInstance();
  await runner.diagnose(code);
  return runner.program;
}

/** Runs this emitter over one program, with the Avro feature on. */
async function runAsyncAPI(program: Program): Promise<void> {
  await emitAsyncAPI({
    program,
    emitterOutputDir: "/out/asyncapi",
    options: { "preview-features": ["avro"] },
  } as EmitContext<AsyncAPIEmitterOptions>);
}

/** Runs the Avro emitter over one program. */
async function runAvro(program: Program): Promise<void> {
  await emitAvro({
    program,
    emitterOutputDir: "/out/avro",
    options: {},
  } as EmitContext<AvroEmitterOptions>);
}

/** How many diagnostics of a program carry codes of one library. */
function countsByLibrary(program: Program): { avro: number; asyncapi: number } {
  const codes = program.diagnostics.map((diagnostic) => diagnostic.code);
  return {
    avro: codes.filter((code) => code.startsWith("tsp-avro/")).length,
    asyncapi: codes.filter((code) => code.startsWith("tsp-asyncapi/")).length,
  };
}

describe("Unit: Avro refusals reported once per library", () => {
  it("says nothing under the Avro library when only this emitter runs", async () => {
    const program = await compile(REFUSED);
    await runAsyncAPI(program);

    // One reason, said once, under the code of the library the project asked
    // to emit. Nothing names a library that is not in `emit`.
    const counts = countsByLibrary(program);
    expect(counts).toEqual({ avro: 0, asyncapi: 1 });
    expect(program.diagnostics[0]?.code).toBe("tsp-asyncapi/avro-artifact-unavailable");
  });

  it("reports the one problem once from each library when both emitters run", async () => {
    const program = await compile(REFUSED);
    await runAvro(program);
    await runAsyncAPI(program);

    // Two emitters, two codes, one reason each. Neither library reports the
    // problem twice, and neither reports the other's code.
    const counts = countsByLibrary(program);
    expect(counts).toEqual({ avro: 1, asyncapi: 1 });
    expect(program.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "tsp-avro/unsupported-type",
      "tsp-asyncapi/avro-artifact-unavailable",
    ]);
  });

  it("reports the same counts whichever emitter runs first", async () => {
    const program = await compile(REFUSED);
    await runAsyncAPI(program);
    await runAvro(program);

    expect(countsByLibrary(program)).toEqual({ avro: 1, asyncapi: 1 });
  });
});
