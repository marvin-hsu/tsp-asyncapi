import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import {
  getChannel,
  getParameterLocation,
  getUsedServers,
  listChannels,
} from "#core/decorators/index.js";

describe("Unit: Channel state read-back", () => {
  it("reads back the address and the explicit id of one channel", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ OrderChannel }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created", "orders")
      interface ${t.interface("OrderChannel")} {
        publish(event: OrderCreated): void;
      }
    `);

    expectDiagnosticEmpty(diagnostics);
    expect(getChannel(runner.program, OrderChannel)).toEqual({
      address: "orders.created",
      channelId: "orders",
    });
  });

  it("reads back a null address for a dynamic channel", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ ReplyChannel }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ${t.interface("ReplyChannel")} {
        receive(response: OrderAccepted): void;
      }
    `);

    expectDiagnosticEmpty(diagnostics);
    expect(getChannel(runner.program, ReplyChannel)).toEqual({ address: null });
  });

  it("keeps the recorded channel safe from a change to the returned state", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ OrderChannel }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface ${t.interface("OrderChannel")} {
        publish(event: OrderCreated): void;
      }
    `);

    expectDiagnosticEmpty(diagnostics);
    const read = getChannel(runner.program, OrderChannel);
    const listed = listChannels(runner.program).get(OrderChannel);

    expect(read).toEqual({ address: "orders.created" });
    expect(listed).toEqual({ address: "orders.created" });

    // Both read-backs hand out a copy, so a caller that writes to one cannot
    // change what the next caller reads.
    Object.assign(read ?? {}, { address: "mutated" });
    Object.assign(listed ?? {}, { address: "mutated too" });

    expect(getChannel(runner.program, OrderChannel)).toEqual({ address: "orders.created" });
  });

  it("returns undefined for a target whose channel was dropped", async () => {
    const runner = await AsyncAPITester.createInstance();
    // The two decorators together drop the declaration outright, so the
    // target carries no channel to read back.
    const [{ Broken }] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.created")
      @dynamicChannel
      interface ${t.interface("Broken")} {}
    `);

    expect(getChannel(runner.program, Broken)).toBeUndefined();
  });

  it("lists every channel in source order", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ First, Second }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.first")
      interface ${t.interface("First")} {
        publish(event: OrderCreated): void;
      }

      @channel("orders.second")
      interface ${t.interface("Second")} {
        publish(event: OrderCreated): void;
      }
    `);

    expectDiagnosticEmpty(diagnostics);
    const listed = listChannels(runner.program);

    expect([...listed.keys()]).toEqual([First, Second]);
    expect([...listed.values()].map((state) => state.address)).toEqual([
      "orders.first",
      "orders.second",
    ]);
  });

  it("reads back every @useServer application, and an empty list for none", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ OrderChannel, Plain }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @useServer("kafka-prod")
      @useServer("kafka-dr")
      interface ${t.interface("OrderChannel")} {
        publish(event: OrderCreated): void;
      }

      @channel("orders.plain")
      interface ${t.interface("Plain")} {
        publish(event: OrderCreated): void;
      }
    `);

    expectDiagnosticEmpty(diagnostics);

    // The order is the order the applications ran, which is bottom-up. Only
    // the emitted array is in source order.
    expect(getUsedServers(runner.program, OrderChannel).map((entry) => entry.name)).toEqual([
      "kafka-dr",
      "kafka-prod",
    ]);
    expect(getUsedServers(runner.program, Plain)).toEqual([]);
  });

  it("reads back the location of one parameter, and undefined for a rejected one", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ publish }] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{orderId}.{region}")
      interface OrderChannel {
        ${t.op("publish")}(
          @parameterLocation("$message.payload#/id") orderId: string,
          @parameterLocation("payload/region") region: string,
          event: OrderCreated,
        ): void;
      }
    `);

    const locationOf = (name: string): string | undefined => {
      const property = publish.parameters.properties.get(name);
      expect(property).toBeDefined();
      return property === undefined ? undefined : getParameterLocation(runner.program, property);
    };

    expect(locationOf("orderId")).toBe("$message.payload#/id");
    // The expression was rejected, so nothing was recorded for it.
    expect(locationOf("region")).toBeUndefined();
    expect(locationOf("event")).toBeUndefined();
  });
});
