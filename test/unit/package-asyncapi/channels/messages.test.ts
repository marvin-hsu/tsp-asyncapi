import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { findDiagnostic } from "../../../utils/diagnostics.js";
import { documentFrom } from "../../../utils/test-host.js";

describe("Unit: Channel messages (Phase 4.2)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("collects two messages from the parameters and the return type of one operation", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        publish(event: OrderCreated): OrderAccepted;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.channels?.["orders.created"].messages).toEqual({
      OrderCreated: { $ref: "#/components/messages/OrderCreated" },
      OrderAccepted: { $ref: "#/components/messages/OrderAccepted" },
    });
  });

  it("collects the variants of a union parameter", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @message
      model OrderCancelled {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: OrderCreated | OrderCancelled): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual([
      "OrderCreated",
      "OrderCancelled",
    ]);
  });

  it("collects the element type of an array parameter", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(events: OrderCreated[]): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["OrderCreated"]);
  });

  it("collects the element type of a record parameter", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(events: Record<OrderCreated>): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["OrderCreated"]);
  });

  it("keeps a model that carries an indexer of its own", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Bag {
        ...Record<string>;
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: Bag): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // The model has properties, so it is a payload with an indexer, not an
    // `Array<T>` or a `Record<T>`. Unwrapping it would replace the message
    // with its element type.
    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["Bag"]);
  });

  it("leaves the indexer of a model that carries no message alone", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Hidden {
        id: string;
      }

      @message
      model Shown {
        id: string;
      }

      model Bag {
        ...Record<Hidden>;
        label: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: Shown): Bag;
      }
    `);

    const doc = await documentFrom(runner.program);

    // `Bag` carries no `@message`, so the walk does not stop at it and reaches
    // the collection check. It has properties of its own, so it is not a
    // `Record<T>` and its element type is not a message of this channel.
    // The test above cannot show this: its `Bag` is a message, so the walk
    // returns before the check runs.
    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["Shown"]);
  });

  it("emits one entry for a message one operation names twice", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Envelope {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: Envelope): Envelope;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["Envelope"]);
  });

  it("keeps a message key such as __proto__ as an own key of the map", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("__proto__")
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const messages = (await documentFrom(runner.program)).channels?.orders.messages;

    // The map is built with `Object.fromEntries`, so the key becomes an own
    // property instead of a write to the prototype.
    expect(Object.hasOwn(messages ?? {}, "__proto__")).toBe(true);
    expect(Object.keys(messages ?? {})).toEqual(["__proto__"]);
  });

  it("emits one entry for a message two operations name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: OrderCreated): void;
        republish(event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["OrderCreated"]);
  });

  it("uses the explicit @message key in the reference", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("order-created")
      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.channels?.orders.messages).toEqual({
      "order-created": { $ref: "#/components/messages/order-created" },
    });
  });

  it("does not collect a model nested inside a payload", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Inner {
        id: string;
      }

      model Outer {
        inner: Inner;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: Outer): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.channels?.orders.messages).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/channel-no-messages");
  });

  it("warns and omits the field when the channel names no message", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      model OrderCreated {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);
    const warning = findDiagnostic(diagnostics, "channel-no-messages");

    expect(warning.severity).toBe("warning");
    expect(warning.message).toMatch(/'orders'/);
    expect(doc.channels?.orders).not.toHaveProperty("messages");
  });

  it("contributes no entry for a message a key collision dropped", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message("orders")
      model First {
        id: string;
      }

      @message("orders")
      model Second {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        publish(event: Second): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/duplicate-message-key");
    expect(doc.channels?.orders).not.toHaveProperty("messages");
  });

  it("keeps the messages of two operations in the source order of the operations", async () => {
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

      @channel("orders")
      interface OrderChannel {
        publish(event: First): void;
        subscribe(event: Second): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // The compiler hands back the members of an interface in a map whose
    // order is not promised to be source order, so the builder sorts them.
    // The keys of the emitted map are what that sort decides.
    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["First", "Second"]);
  });

  it("orders an inherited operation by where its interface is declared", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Own {
        id: string;
      }

      @message
      model Inherited {
        id: string;
      }

      @channel("orders")
      interface OrderChannel extends Base {
        publish(event: Own): void;
      }

      interface Base {
        subscribe(event: Inherited): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // `Base` is declared after `OrderChannel`, so the inherited operation sits
    // later in the source than the own one. The compiler's member map puts an
    // inherited member first, which is the opposite order. This input is the
    // one that tells the two apart: without the sort the keys come out as
    // Inherited then Own. The test above cannot show that, because there the
    // two orders agree.
    expect(Object.keys(doc.channels?.orders.messages ?? {})).toEqual(["Own", "Inherited"]);
  });

  it("keeps a message that is declared as a record", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Bag is Record<string>;

      @channel("orders")
      interface OrderChannel {
        publish(bag: Bag): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // A model marked `@message` is the message, whatever it is declared as.
    // Unwrapping this one to its `string` element would drop the message
    // from the channel, and would then read the payload parameter as a
    // channel address parameter.
    expect(doc.channels?.orders.messages).toEqual({
      Bag: { $ref: "#/components/messages/Bag" },
    });
    expect(diagnostics).toEqual([]);
  });

  it("keeps a message that is declared as an array", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      model Item {
        id: string;
      }

      @message
      model Items is Array<Item>;

      @channel("orders")
      interface OrderChannel {
        publish(items: Items): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.channels?.orders.messages).toEqual({
      Items: { $ref: "#/components/messages/Items" },
    });
    expect(diagnostics).toEqual([]);
  });

  it("walks a model that names itself", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      model Tree is Array<Tree>;

      @channel("orders")
      interface OrderChannel {
        publish(tree: Tree, event: OrderCreated): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    // `model Tree is Array<Tree>` is legal TypeSpec. The walk must end on
    // the second visit rather than recurse until the stack runs out.
    expect(doc.channels?.orders.messages).toEqual({
      OrderCreated: { $ref: "#/components/messages/OrderCreated" },
    });
  });

  it("walks a union that names itself", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      union Chain {
        event: OrderCreated,
        rest: Chain,
      }

      @channel("orders")
      interface OrderChannel {
        publish(chain: Chain): void;
      }
    `);

    const doc = await documentFrom(runner.program);

    expect(doc.channels?.orders.messages).toEqual({
      OrderCreated: { $ref: "#/components/messages/OrderCreated" },
    });
  });
});
