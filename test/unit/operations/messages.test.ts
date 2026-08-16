import { beforeEach, describe, expect, it } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../src/builders/document.js";

describe("Unit: Operation messages (Phase 5.2)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("references the channel messages map, never components.messages", async () => {
    // AsyncAPI requires an operation to name a message of its channel. A
    // reference straight into `components.messages` is the common mistake
    // here, and the specification's own example carries it.
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

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    const messages = doc.operations?.publish.messages ?? [];

    expect(messages).toHaveLength(1);
    expect(messages[0].$ref.startsWith("#/channels/")).toBe(true);
    expect(messages[0].$ref).toBe("#/channels/OrderChannel/messages/OrderCreated");
  });

  it("emits one entry per variant of a union return type", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderShipped {
        id: string;
      }

      @channel("orders.events")
      interface OrderChannel {
        @receive op consume(): OrderCreated | OrderShipped;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.consume.messages).toEqual([
      { $ref: "#/channels/OrderChannel/messages/OrderCreated" },
      { $ref: "#/channels/OrderChannel/messages/OrderShipped" },
    ]);
  });

  it("keeps the parameters in signature order", async () => {
    // The list must not be palindromic, or a reversed walk yields the same
    // result and the order is not pinned at all.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model First {
        id: string;
      }

      @message
      model Second {
        id: string;
      }

      @message
      model Third {
        id: string;
      }

      @channel("orders.events")
      interface OrderChannel {
        @send op publish(a: First, b: Second, c: Third): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.publish.messages).toEqual([
      { $ref: "#/channels/OrderChannel/messages/First" },
      { $ref: "#/channels/OrderChannel/messages/Second" },
      { $ref: "#/channels/OrderChannel/messages/Third" },
    ]);
  });

  it("keeps signature order and removes a repeat", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model First {
        id: string;
      }

      @message
      model Second {
        id: string;
      }

      @channel("orders.events")
      interface OrderChannel {
        @send op publish(a: First, b: Second, c: First): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.publish.messages).toEqual([
      { $ref: "#/channels/OrderChannel/messages/First" },
      { $ref: "#/channels/OrderChannel/messages/Second" },
    ]);
  });

  it("unwraps an array of messages", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @receive op consume(): OrderCreated[];
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.consume.messages).toEqual([
      { $ref: "#/channels/OrderChannel/messages/OrderCreated" },
    ]);
  });

  it("omits the messages field when the signature names none", async () => {
    // An absent field means every message of the channel. An empty array
    // would say the opposite, because AsyncAPI requires every message to
    // match one entry of the list.
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
        @receive op onAny(): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.onAny).not.toHaveProperty("messages");
    expect(doc.operations?.onAny.action).toBe("receive");
  });

  it("leaves a channel parameter out of the messages", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.{region}.created")
      interface OrderChannel {
        @send op publish(region: string, event: OrderCreated): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.publish.messages).toEqual([
      { $ref: "#/channels/OrderChannel/messages/OrderCreated" },
    ]);
  });

  it("gives a send operation its parameters and a receive operation its return type", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Command {
        id: string;
      }

      @message
      model Event {
        id: string;
      }

      @channel("orders.events")
      interface OrderChannel {
        @send op push(command: Command): void;
        @receive op pull(): Event;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.push.messages).toEqual([
      { $ref: "#/channels/OrderChannel/messages/Command" },
    ]);
    expect(doc.operations?.pull.messages).toEqual([
      { $ref: "#/channels/OrderChannel/messages/Event" },
    ]);
  });
});
