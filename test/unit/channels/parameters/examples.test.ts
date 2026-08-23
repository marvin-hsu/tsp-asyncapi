import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { diagnosticsWith } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";

describe("Unit: Channel parameters: examples (Phase 4.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("drops an example it cannot serialize, and reports it", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{source}")
      interface OrderChannel {
        publish(@example(ipv4.fromBytes(1, 2, 3, 4)) source: ipv4, event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);
    const reported = diagnosticsWith(diagnostics, "unserializable-example");

    expect(reported).toHaveLength(1);
    expect(reported[0].severity).toBe("warning");
    expect(doc.channels?.["orders.{source}"].parameters).toEqual({ source: {} });
  });

  it("leaves out an example that does not serialize to a string", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}")
      interface OrderChannel {
        publish(@example(1234) orderId: int32, event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // AsyncAPI types `examples` as strings, so the number has no place in it.
    // The type itself is the mistake the author is told about.
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/non-string-channel-param");
    expect(doc.channels?.["orders.{orderId}"].parameters).toEqual({ orderId: {} });
  });

  it("reports an unserializable example once when two operations declare the parameter", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      scalar ipv4 extends string {
        init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
      }

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{source}")
      interface OrderChannel {
        publish(@example(ipv4.fromBytes(1, 2, 3, 4)) source: ipv4, event: OrderCreated): void;
        republish(source: ipv4, event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);
    const reported = diagnosticsWith(diagnostics, "unserializable-example");

    // Two operations declare `source`, so the first declaration is read
    // twice: once to compare it with the second, and once to emit it. The
    // reader keeps what it has already read, so the one mistake is reported
    // once. Without that, the author sees the same warning twice.
    expect(reported).toHaveLength(1);
    expect(doc.channels?.["orders.{source}"].parameters).toEqual({ source: {} });
  });

  it("keeps two examples of one parameter in source order", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}")
      interface OrderChannel {
        publish(@example("eu") @example("us") region: string, event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // Stacked decorators run bottom-up, so the recorded order is `us` then
    // `eu`. The emitted array is sorted back into source order.
    expect(doc.channels?.["orders.{region}"].parameters).toEqual({
      region: { examples: ["eu", "us"] },
    });
  });
});
