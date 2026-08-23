import { beforeEach, describe, expect, it } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { documentFrom } from "../../../utils/test-host.js";

describe("Unit: Operation documentation (Phase 5.3)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("fills every descriptive field from the decorators that reach an operation", async () => {
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
        @summary("Publish an order")
        @doc("Sends one event for every order a customer places.")
        @tag("orders")
        @asyncTag("events", #{ description: "Domain events." })
        @externalDocs("https://example.com/orders", "The order guide.")
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations?.publish).toEqual({
      action: "send",
      channel: { $ref: "#/channels/orders.created" },
      title: "Publish an order",
      description: "Sends one event for every order a customer places.",
      tags: [{ name: "orders" }, { name: "events", description: "Domain events." }],
      externalDocs: { url: "https://example.com/orders", description: "The order guide." },
      messages: [{ $ref: "#/channels/orders.created/messages/OrderCreated" }],
    });
  });

  it("leaves out a descriptive field the operation does not carry", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);
    const operation = doc.operations?.publish ?? {};

    expect(operation).not.toHaveProperty("title");
    expect(operation).not.toHaveProperty("description");
    expect(operation).not.toHaveProperty("tags");
    expect(operation).not.toHaveProperty("externalDocs");
    expect(operation).not.toHaveProperty("summary");
    expect(operation).not.toHaveProperty("bindings");
  });

  it("leaves out a blank summary and a blank doc", async () => {
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
        @summary("   ")
        @doc("   ")
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations?.publish).not.toHaveProperty("title");
    expect(doc.operations?.publish).not.toHaveProperty("description");
  });
});
