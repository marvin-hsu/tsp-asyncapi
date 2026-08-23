/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/unbound-method, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect } from "vitest";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { $onEmit } from "#emitter/emitter.js";
import { EmitContext } from "@typespec/compiler";

describe("Unit: $onEmit", () => {
  it("should emit asyncapi document correctly", async () => {
    const runner = await AsyncAPITester.createInstance();
    await runner.compile(`
      @service(#{ title: "Emit Test" })
      namespace Test;
    `);

    let emittedPath = "";
    let emittedContent = "";

    const mockContext = {
      program: runner.program,
      options: {
        "file-type": "json",
        "output-file": "custom.json",
      },
      emitterOutputDir: "/mock-out",
    } as unknown as EmitContext<any>;

    // We override emitFile on program to capture the output without writing to real disk
    const originalEmitFile = runner.program.host.writeFile;
    runner.program.host.writeFile = async (path: string, content: string) => {
      emittedPath = path;
      emittedContent = content;
    };

    await $onEmit(mockContext);

    expect(emittedPath).toContain("custom.json");
    expect(emittedContent).toContain('"title": "Emit Test"');

    // restore
    runner.program.host.writeFile = originalEmitFile;
  });
});
