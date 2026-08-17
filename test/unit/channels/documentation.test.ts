import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../src/pipeline.js";

describe("Unit: Channel documentation (Phase 4.4)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("fills every descriptive field at once", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @summary("Order events")
      @doc("Every event about the life of an order.")
      @tag("orders")
      @asyncTag("public", #{ description: "Open to every consumer." })
      @externalDocs("https://example.com/orders", "The order guide.")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.["orders.created"]).toEqual({
      address: "orders.created",
      title: "Order events",
      description: "Every event about the life of an order.",
      messages: { OrderCreated: { $ref: "#/components/messages/OrderCreated" } },
      tags: [{ name: "orders" }, { name: "public", description: "Open to every consumer." }],
      externalDocs: { url: "https://example.com/orders", description: "The order guide." },
    });
  });

  it("emits no summary field, because TypeSpec has no third source of prose", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @summary("Order events")
      @doc("Every event about the life of an order.")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.["orders.created"]).not.toHaveProperty("summary");
  });

  it("leaves out a descriptive field the channel does not carry", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const channel = doc.channels?.["orders.created"];

    expect(channel).not.toHaveProperty("title");
    expect(channel).not.toHaveProperty("description");
    expect(channel).not.toHaveProperty("tags");
    expect(channel).not.toHaveProperty("externalDocs");
  });

  it("fills the descriptive fields of a channel on a namespace", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @doc("Every event about the life of an order.")
      @asyncTag("public")
      namespace Orders {
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.["orders.created"].description).toBe(
      "Every event about the life of an order.",
    );
    expect(doc.channels?.["orders.created"].tags).toEqual([{ name: "public" }]);
  });
});
