import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { documentFrom } from "../../../../utils/test-host.js";

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

    const doc = documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-parameter-location");
    expect(doc.channels?.["orders.{orderId}"].parameters).toEqual({ orderId: {} });
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

    const doc = documentFrom(runner.program);

    expect(diagnostics).toEqual([]);
    expect(doc.channels?.["orders.{region}.{tenant}"].parameters).toEqual({
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

    const doc = documentFrom(runner.program);

    // The normative JSON Schema of AsyncAPI requires the `#`, and the
    // official parser rejects a document without it.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-parameter-location");
    expect(doc.channels?.["orders.{region}"].parameters).toEqual({ region: {} });
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
