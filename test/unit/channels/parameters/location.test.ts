import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../../src/pipeline.js";

describe("Unit: Channel parameters: @parameterLocation (Phase 4.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("rejects a location that is not a runtime expression", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(@parameterLocation("payload/id") orderId: string, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-parameter-location");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ orderId: {} });
  });

  it("accepts a header location and an empty pointer", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}.{tenant}")
      interface OrderChannel {
        publish(
          @parameterLocation("$message.header#/region") region: string,
          @parameterLocation("$message.header#") tenant: string,
          event: OrderCreated,
        ): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(diagnostics).toEqual([]);
    expect(doc.channels?.OrderChannel.parameters).toEqual({
      region: { location: "$message.header#/region" },
      tenant: { location: "$message.header#" },
    });
  });

  it("rejects a location that leaves out the fragment", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(@parameterLocation("$message.header") region: string, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The normative JSON Schema of AsyncAPI requires the `#`, and the
    // official parser rejects a document without it.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-parameter-location");
    expect(doc.channels?.OrderChannel.parameters).toEqual({ region: {} });
  });

  it("reports a second @parameterLocation on one property", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(
          @parameterLocation("$message.payload#/a")
          @parameterLocation("$message.payload#/b")
          orderId: string,

          event: OrderCreated,
        ): void;
      }
    `);

    expect(diagnostics.map((d) => d.code)).toContain(
      "tsp-asyncapi/duplicate-parameter-location-decorator",
    );
  });
});
