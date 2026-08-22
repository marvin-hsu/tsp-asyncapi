import { beforeEach, describe, expect, it } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../src/pipeline.js";
import { findDiagnostic, targetText } from "../../utils/diagnostics.js";

describe("Unit: Operation reply (Phase 5.4)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("derives a same-channel reply from the two sides of the signature", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.createOrder.messages).toEqual([
      { $ref: "#/channels/orders.create/messages/CreateOrder" },
    ]);
    expect(doc.operations?.createOrder.reply).toEqual({
      channel: { $ref: "#/channels/orders.create" },
      messages: [{ $ref: "#/channels/orders.create/messages/OrderAccepted" }],
    });
  });

  it("inverts the two sides for a receive operation", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @channel("orders.create")
      interface OrderChannel {
        @receive op onCreateOrder(reply: OrderAccepted): CreateOrder;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.onCreateOrder.messages).toEqual([
      { $ref: "#/channels/orders.create/messages/CreateOrder" },
    ]);
    expect(doc.operations?.onCreateOrder.reply?.messages).toEqual([
      { $ref: "#/channels/orders.create/messages/OrderAccepted" },
    ]);
  });

  it("emits no reply when only one side of the signature carries a message", async () => {
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

    expect(doc.operations?.publish).not.toHaveProperty("reply");
  });

  it("emits no reply when one side names a model that is not a message", async () => {
    // Both sides carry a model here, so a check that only counts the models
    // would derive a reply. A reply needs a message of the channel on each
    // side, and a plain payload is not one.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      model PlainPayload {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send op publish(event: OrderCreated): PlainPayload;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.publish).not.toHaveProperty("reply");
  });

  it("leaves a plain payload on the reply side out of the reply and out of the channel", async () => {
    // `PlainPayload` describes no message, so it is payload data. It reaches
    // neither `reply.messages` nor the `messages` map of the reply channel.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      model PlainPayload {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): CreateOrder;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        op createOrder(command: CreateOrder): PlainPayload;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.createOrder.reply).toEqual({
      channel: { $ref: "#/channels/ReplyChannel" },
    });
    expect(doc.channels?.ReplyChannel.messages).toEqual({
      CreateOrder: { $ref: "#/components/messages/CreateOrder" },
    });
  });

  it("points the reply at the channel @replyChannel names", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @channel("orders.reply")
      interface ReplyChannel {
        @receive op onAccepted(): OrderAccepted;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.createOrder.reply).toEqual({
      channel: { $ref: "#/channels/orders.reply" },
      messages: [{ $ref: "#/channels/orders.reply/messages/OrderAccepted" }],
    });
  });

  it("emits the reply address over a dynamic channel", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): OrderAccepted;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        @replyAddress("$message.header#/replyTo", "Where the reply goes.")
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.createOrder.reply).toEqual({
      address: { location: "$message.header#/replyTo", description: "Where the reply goes." },
      channel: { $ref: "#/channels/ReplyChannel" },
      messages: [{ $ref: "#/channels/ReplyChannel/messages/OrderAccepted" }],
    });
  });

  it("emits a reply with no messages when the signature names none", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): OrderAccepted;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        op createOrder(command: CreateOrder): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.createOrder.reply).toEqual({
      channel: { $ref: "#/channels/ReplyChannel" },
    });
  });

  it("escapes a slash in the id of the reply channel", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @channel("orders.reply", "orders/reply")
      interface ReplyChannel {
        @receive op onAccepted(): OrderAccepted;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.operations?.createOrder.reply).toEqual({
      channel: { $ref: "#/channels/orders~1reply" },
      messages: [{ $ref: "#/channels/orders~1reply/messages/OrderAccepted" }],
    });
  });

  it("keeps a cross-channel reply message off the channel of the request", async () => {
    // AsyncAPI reads the `messages` map of a channel as the messages that
    // travel over that channel. The reply travels over the reply channel, so
    // listing it on both would make a generator build a consumer for it on
    // the address of the request.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onOrderAccepted(): OrderAccepted;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.["orders.create"].messages).toEqual({
      CreateOrder: { $ref: "#/components/messages/CreateOrder" },
    });
    expect(doc.channels?.ReplyChannel.messages).toEqual({
      OrderAccepted: { $ref: "#/components/messages/OrderAccepted" },
    });
  });

  it("keeps both sides on the channel when the reply travels over it", async () => {
    // `@replyChannel` naming the channel the operation already runs over
    // changes nothing. Both sides still travel over that one channel.
    //
    // The two message names are deliberately not in alphabetical order here.
    // The `messages` map follows the signature, parameters first, and that
    // order is user-visible YAML. Alphabetical names would let a sort pass
    // unnoticed.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model SubmitOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(OrderChannel)
        op createOrder(command: SubmitOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.["orders.create"].messages).toEqual({
      SubmitOrder: { $ref: "#/components/messages/SubmitOrder" },
      OrderAccepted: { $ref: "#/components/messages/OrderAccepted" },
    });
    // `toEqual` ignores key order, so the order is pinned on its own.
    expect(Object.keys(doc.channels?.["orders.create"].messages ?? {})).toEqual([
      "SubmitOrder",
      "OrderAccepted",
    ]);
  });

  it("reports a reply address on a channel that carries an address", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyAddress("$message.header#/replyTo")
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = findDiagnostic(diagnostics, "reply-address-needs-dynamic-channel");
    expect(diagnostic.message).toContain("@dynamicChannel");
    expect(targetText(diagnostic)).toBe(`"$message.header#/replyTo"`);
    // The address goes, and the rest of the reply stays.
    expect(doc.operations?.createOrder.reply).toEqual({
      channel: { $ref: "#/channels/orders.create" },
      messages: [{ $ref: "#/channels/orders.create/messages/OrderAccepted" }],
    });
  });

  it("puts the reply message on a reply channel that already carries messages", async () => {
    // The reply channel owns an operation of its own here. The reply message
    // joins the messages that operation contributes, after them.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @message
      model Ack {
        id: string;
      }

      @channel("orders.reply")
      interface ReplyChannel {
        @receive op onAck(): Ack;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(Object.keys(doc.channels?.["orders.reply"].messages ?? {})).toEqual([
      "Ack",
      "OrderAccepted",
    ]);
    expect(doc.operations?.createOrder.reply).toEqual({
      channel: { $ref: "#/channels/orders.reply" },
      messages: [{ $ref: "#/channels/orders.reply/messages/OrderAccepted" }],
    });
  });

  it("carries the reply message on a reply channel that owns no operation", async () => {
    // This is the dynamic reply-address shape. The reply channel exists only
    // to answer this one operation, so it owns no operation of its own. The
    // reply message still travels over it, so the channel carries it, and the
    // author needs no extra operation to say so.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {}

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        @replyAddress("$message.header#/replyTo")
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.channels?.ReplyChannel.messages).toEqual({
      OrderAccepted: { $ref: "#/components/messages/OrderAccepted" },
    });
    expect(doc.operations?.createOrder.reply).toEqual({
      address: { location: "$message.header#/replyTo" },
      channel: { $ref: "#/channels/ReplyChannel" },
      messages: [{ $ref: "#/channels/ReplyChannel/messages/OrderAccepted" }],
    });
    expect(
      runner.program.diagnostics.filter(
        (diagnostic) => diagnostic.code === "tsp-asyncapi/channel-no-messages",
      ),
    ).toHaveLength(0);
  });

  it("reports a reply channel that carries no channel and drops the whole reply", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      interface NotAChannel {
        op nothing(): void;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(NotAChannel)
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = findDiagnostic(diagnostics, "reply-channel-not-a-channel");
    expect(diagnostic.message).toContain("'NotAChannel'");
    expect(targetText(diagnostic)).toBe("NotAChannel");
    expect(doc.operations?.createOrder).not.toHaveProperty("reply");
  });

  it("reports a location outside the runtime expression grammar", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): CreateOrder;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        @replyAddress("$request.header#/replyTo")
        op createOrder(command: CreateOrder): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = findDiagnostic(diagnostics, "invalid-reply-address-location");
    expect(diagnostic.message).toContain("$message.header#");
    expect(doc.operations?.createOrder.reply).not.toHaveProperty("address");
  });

  it("reports a second @replyChannel and a second @replyAddress", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): CreateOrder;
      }

      @dynamicChannel
      interface OtherReplyChannel {
        @receive op onOther(): CreateOrder;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(OtherReplyChannel)
        @replyChannel(ReplyChannel)
        @replyAddress("$message.header#/a")
        @replyAddress("$message.header#/b")
        op createOrder(command: CreateOrder): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    findDiagnostic(diagnostics, "duplicate-reply-channel-decorator");
    findDiagnostic(diagnostics, "duplicate-reply-address-decorator");
    // Decorators run bottom-up, so the one written last runs first and wins.
    // The two applications name two different channels, so the winner shows.
    expect(doc.operations?.createOrder.reply?.channel).toEqual({
      $ref: "#/channels/ReplyChannel",
    });
    expect(doc.operations?.createOrder.reply?.address).toEqual({
      location: "$message.header#/b",
    });
  });

  it("reports a @replyAddress on an operation with no action", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @channel("orders.create")
      interface OrderChannel {
        @replyAddress("$message.header#/replyTo")
        op createOrder(command: CreateOrder): void;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    findDiagnostic(diagnostics, "reply-without-action");
    expect(doc.operations).toEqual({});
  });

  it("reports a @replyChannel on an operation with no action", async () => {
    // Either decorator on its own emits a reply, so either one on its own
    // reaches nothing when the operation carries no action.
    //
    // The action is also what decides which side of the signature is the
    // reply. With no action there is no reply, so neither side leaves for the
    // reply channel and both stay on the channel of the operation. The two
    // message names are not in alphabetical order, so the assertion below
    // pins the signature order rather than a sort.
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model SubmitOrder {
        id: string;
      }

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): OrderAccepted;
      }

      @channel("orders.create")
      interface OrderChannel {
        @replyChannel(ReplyChannel)
        op createOrder(command: SubmitOrder): OrderAccepted;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = findDiagnostic(diagnostics, "reply-without-action");
    expect(targetText(diagnostic)).toBe("ReplyChannel");
    expect(doc.operations).not.toHaveProperty("createOrder");
    expect(Object.keys(doc.channels?.["orders.create"].messages ?? {})).toEqual([
      "SubmitOrder",
      "OrderAccepted",
    ]);
  });

  it("stays silent about a reply decorator on an operation with an action", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model CreateOrder {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        @receive op onAccepted(): CreateOrder;
      }

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        @replyAddress("$message.header#/replyTo")
        op createOrder(command: CreateOrder): void;
      }
    `);

    buildAsyncAPIDocument(runner.program, undefined, {});

    expect(
      runner.program.diagnostics.filter(
        (diagnostic) => diagnostic.code === "tsp-asyncapi/reply-without-action",
      ),
    ).toHaveLength(0);
  });
});
