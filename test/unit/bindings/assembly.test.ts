import { beforeEach, describe, expect, it } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { listServices } from "@typespec/compiler";
import { buildAsyncAPIDocument } from "../../../src/builders/document.js";

/**
 * These drive the builder directly, the way the other unit suites do.
 *
 * The suites beside this one go through the emitter, which loads the build
 * output. Both routes matter: the emitter is what a user runs, and the direct
 * call is what pins the assembly rules on their own, without a file write in
 * between.
 */
describe("Unit: assembling a Bindings Object", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("puts every protocol of one channel in source order", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ qos: 1 })
      @binding("amqp", #{ expiration: 100 })
      @kafkaChannel(#{ topic: "orders.created", partitions: 3 })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const bindings = doc.channels?.OrderChannel.bindings as Record<string, unknown>;
    // The members read in the order the author wrote the decorators, so the
    // emitted document is the same on every run.
    expect(Object.keys(bindings)).toEqual(["mqtt", "amqp", "kafka"]);
    expect(bindings.kafka).toEqual({
      topic: "orders.created",
      partitions: 3,
      bindingVersion: "0.5.0",
    });
    // Only a Kafka decorator knows which version its fields come from, so the
    // generic decorator adds none.
    expect(bindings.mqtt).toEqual({ qos: 1 });
  });

  it("omits the field when a target carries no binding", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // An empty Bindings Object states nothing, so the field is left out.
    expect(doc.channels?.OrderChannel).not.toHaveProperty("bindings");
    expect(doc.operations?.publish).not.toHaveProperty("bindings");
  });

  it("keeps the first application when one protocol is claimed twice", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @binding("kafka", #{ topic: "first" })
      @kafkaChannel(#{ topic: "second" })
      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The two are never merged, and the later one never wins.
    const bindings = doc.channels?.OrderChannel.bindings as Record<string, unknown>;
    expect(bindings.kafka).toEqual({ topic: "first" });
    expect(
      runner.program.diagnostics.some((d) => d.code === "tsp-asyncapi/duplicate-binding"),
    ).toBe(true);
  });

  it("reaches a server, a message, and an operation from one program", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      namespace Test;

      @kafkaMessage(#{ schemaIdLocation: "payload" })
      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, listServices(runner.program)[0], {});

    expect(doc.servers?.prod.bindings?.kafka).toEqual({
      schemaRegistryUrl: "https://registry.example.com",
      bindingVersion: "0.5.0",
    });
    expect(doc.components?.messages?.OrderCreated.bindings?.kafka).toEqual({
      schemaIdLocation: "payload",
      bindingVersion: "0.5.0",
    });
    expect(doc.operations?.publish.bindings?.kafka).toEqual({
      groupId: { type: "string" },
      bindingVersion: "0.5.0",
    });
  });
});
