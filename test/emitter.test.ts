import { describe, it, expect, beforeEach } from "vitest";
/* eslint-disable @typescript-eslint/no-deprecated */
import { createTestHost, TestHost } from "@typespec/compiler/testing";
import { $onEmit, AsyncAPIEmitterOptions } from "../src/emitter.js";
import { EmitContext } from "@typespec/compiler";

describe("AsyncAPI Emitter", () => {
  let host: TestHost;

  beforeEach(async () => {
    host = await createTestHost({
      libraries: [],
    });
  });

  it("should generate a basic AsyncAPI output", async () => {
    host.addTypeSpecFile(
      "main.tsp",
      `
      namespace TestService;
      `,
    );
    await host.compile("main.tsp", {
      noEmit: false,
    });

    const mockContext: EmitContext<AsyncAPIEmitterOptions> = {
      program: host.program,
      options: {},
      emitterOutputDir: host.compilerHost.fileURLToPath("file:///test-dist"),
    };

    await $onEmit(mockContext);

    const outPath = host.compilerHost.fileURLToPath("file:///test-dist/asyncapi.yaml");
    const content = await host.compilerHost.readFile(outPath);

    expect(content.text).toBeDefined();

    const parsed = JSON.parse(content.text) as {
      asyncapi: string;
      info: { title: string };
    };

    expect(parsed.asyncapi).toBe("2.6.0");
    expect(parsed.info.title).toBe("AsyncAPI Document");
  });
});
