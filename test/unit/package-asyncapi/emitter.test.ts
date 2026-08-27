import { describe, it, expect, vi } from "vitest";
import type { EmitContext, Program } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import { $onEmit } from "#emitter/emitter.js";
import type { AsyncAPIEmitterOptions } from "#emitter/emitter-options.js";

/**
 * The emit context, with the three members this emitter reads.
 *
 * The compiler builds a larger one, and nothing here touches the rest of it.
 *
 * @param program - The compiled program to emit
 * @param options - The emitter options of the run
 * @returns The context to hand to the emitter
 */
function emitContextFor(
  program: Program,
  options: AsyncAPIEmitterOptions,
): EmitContext<AsyncAPIEmitterOptions> {
  return {
    program,
    emitterOutputDir: "/mock-out",
    options,
  } as EmitContext<AsyncAPIEmitterOptions>;
}

describe("Unit: $onEmit", () => {
  it("writes the document to the file the options name", async () => {
    const runner = await AsyncAPITester.createInstance();
    await runner.compile(`
      @service(#{ title: "Emit Test" })
      namespace Test;
    `);

    // The write is captured with a spy rather than an assignment. A spy
    // records the call, so the arguments are read off it instead of out of
    // two variables the replacement had to fill. It also restores the
    // original, which the assignment had to remember to do at the end, and
    // would have skipped on a failure.
    const writeFile = vi.spyOn(runner.program.host, "writeFile").mockResolvedValue(undefined);

    await $onEmit(
      emitContextFor(runner.program, { "file-type": "json", "output-file": "custom.json" }),
    );

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, content] = writeFile.mock.calls[0];
    expect(path).toContain("custom.json");
    expect(content).toContain('"title": "Emit Test"');
  });
});
