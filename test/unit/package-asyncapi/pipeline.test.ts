import { describe, it, expect, beforeEach } from "vitest";
import { listServices } from "@typespec/compiler";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { buildAsyncAPIDocument } from "#emitter/pipeline.js";
import type { SchemaArtifactIndex } from "tsp-asyncapi-core/unstable";

/** One source with a single message model, so resolve reads the index. */
const SOURCE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @message
  model OrderCreated {
    orderId: string;
  }
`;

/** An index whose payload lookup fails, to make one stage throw. */
const failingArtifacts: SchemaArtifactIndex = {
  payloadFor: {
    get() {
      throw new Error("the index failed");
    },
  } as unknown as SchemaArtifactIndex["payloadFor"],
};

describe("Unit: The build pipeline", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("rejects the promise when a stage throws", async () => {
    await runner.compileAndDiagnose(SOURCE);
    const program = runner.program;
    const service = listServices(program)[0];

    // The signature promises the caller a rejection. A body that throws
    // before it returns would escape a `.catch` written on the call.
    const built = buildAsyncAPIDocument(program, service, {}, failingArtifacts);
    await expect(built).rejects.toThrow("the index failed");
  });
});
