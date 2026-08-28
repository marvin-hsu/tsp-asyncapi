import { describe, it, expect, vi } from "vitest";
import type { EmitContext, Program } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import { $onEmit } from "#emitter/emitter.js";
import type { AsyncAPIEmitterOptions } from "#emitter/emitter-options.js";

// Builds the emit context with the three members this emitter reads. The
// compiler builds a larger one; nothing here touches the rest of it.
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

    // The write is captured with a spy so the call arguments can be read off
    // it. Nothing restores the spy, because `createInstance` builds a fresh
    // host for each case.
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
