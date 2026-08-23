import { beforeEach, describe, expect, it } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing/index.js";
import { findDiagnostic, targetText } from "../../utils/diagnostics.js";
import { documentFrom } from "../../utils/test-host.js";

describe("Unit: Operations (Phase 5.1)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits action send and a reference to the channel of the interface", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send op sendOrderCreated(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations?.sendOrderCreated).toEqual({
      action: "send",
      channel: { $ref: "#/channels/orders.created" },
      messages: [{ $ref: "#/channels/orders.created/messages/OrderCreated" }],
    });
  });

  it("emits action receive from the return type", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @receive op onOrderCreated(): OrderCreated;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations?.onOrderCreated).toEqual({
      action: "receive",
      channel: { $ref: "#/channels/orders.created" },
      messages: [{ $ref: "#/channels/orders.created/messages/OrderCreated" }],
    });
  });

  it("points at the channel of the namespace when the operation sits in one", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      namespace Orders {
        @send op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations?.publish.channel).toEqual({ $ref: "#/channels/orders.created" });
  });

  it("lets the interface win over the namespace around it", async () => {
    // A nested interface is a channel scope of its own. The operation belongs
    // to that scope, not to the namespace channel above it.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.outer")
      namespace Outer {
        @channel("orders.inner")
        interface Inner {
          @send op publish(event: OrderCreated): void;
        }
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations?.publish.channel).toEqual({ $ref: "#/channels/orders.inner" });
  });

  it("drops an operation in an interface with no channel inside a namespace with one", async () => {
    // A nested interface is a channel scope of its own, and this one carries
    // no channel. The namespace channel above it must not absorb the
    // operation, so the operation reaches no channel at all.
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.outer")
      namespace Outer {
        interface Inner {
          @send op publish(event: OrderCreated): void;
        }
      }
    `);

    const doc = documentFrom(runner.program);

    // The diagnostic is error severity, so no file is written and the
    // document has to be read from the builder.
    expect(findDiagnostic(diagnostics, "operation-without-channel").message).toContain("'publish'");
    expect(doc.operations).toEqual({});
    expect(doc.channels?.["orders.outer"].messages).toBeUndefined();
  });

  it("keys the operation by the explicit id argument", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send("orders.send") op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(Object.keys(doc.operations ?? {})).toEqual(["orders.send"]);
  });

  it("escapes a slash in the channel id inside every reference", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created", "orders/created")
      interface OrderChannel {
        @send op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations?.publish.channel).toEqual({ $ref: "#/channels/orders~1created" });
    expect(doc.operations?.publish.messages).toEqual([
      { $ref: "#/channels/orders~1created/messages/OrderCreated" },
    ]);
  });

  it("emits an empty operations map when the program declares no operation", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;
    `);

    const doc = documentFrom(runner.program);

    expect(doc.operations).toEqual({});
  });

  it("emits no operation for an operation with neither decorator", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // The operation still contributes its message to the channel.
    expect(doc.operations).toEqual({});
    expect(doc.channels?.["orders.created"].messages).toEqual({
      OrderCreated: { $ref: "#/components/messages/OrderCreated" },
    });
  });

  it("reports a blank operation id and drops the operation", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send("  ") op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    const diagnostic = findDiagnostic(diagnostics, "empty-operation-id");
    expect(targetText(diagnostic)).toBe(`"  "`);
    expect(doc.operations).toEqual({});
  });

  it("reports two operations that resolve to one key and keeps the first", async () => {
    const diagnostics = await runner.diagnose(`
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

      @channel("orders.created")
      interface OrderChannel {
        @send op publish(event: OrderCreated): void;
        @send("publish") op other(event: OrderShipped): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(findDiagnostic(diagnostics, "duplicate-operation-id").message).toContain("'publish'");
    expect(Object.keys(doc.operations ?? {})).toEqual(["publish"]);
    expect(doc.operations?.publish.messages).toEqual([
      { $ref: "#/channels/orders.created/messages/OrderCreated" },
    ]);
  });

  it("gives the clashing key to the action written first, across two interfaces", async () => {
    // The winner of an id clash is decided by source order, and by nothing
    // else. This fixture separates source order from the two orders that
    // could stand in for it by accident.
    //
    // The state map is filled in the order the decorators ran, and augment
    // decorators run per augmented declaration, so `alpha` is recorded first.
    // Alphabetically `alpha` also wins. Source order puts `zebra` first,
    // because its augment statement is written above the other one.
    //
    // The position compared is the one of the decorator, not the one of the
    // operation. `A.alpha` is declared above `B.zebra`, so reading the
    // position from the operation would hand the key to `alpha` as well.
    const diagnostics = await runner.diagnose(`
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

      @channel("orders.a")
      interface A {
        op alpha(event: OrderCreated): void;
      }

      @channel("orders.b")
      interface B {
        op zebra(event: OrderShipped): void;
      }

      @@send(B.zebra, "dup");
      @@send(A.alpha, "dup");
    `);

    const doc = documentFrom(runner.program);

    expect(Object.keys(doc.operations ?? {})).toEqual(["dup"]);
    expect(doc.operations?.dup.channel).toEqual({ $ref: "#/channels/orders.b" });
    expect(doc.operations?.dup.messages).toEqual([
      { $ref: "#/channels/orders.b/messages/OrderShipped" },
    ]);
    expect(findDiagnostic(diagnostics, "duplicate-operation-id").message).toContain("'dup'");
  });

  it("reports an operation whose scope carries no channel", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      interface Loose {
        @send op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(findDiagnostic(diagnostics, "operation-without-channel").message).toContain("'publish'");
    expect(doc.operations).toEqual({});
  });

  it("keys an inherited operation by the interface that inherited it", async () => {
    // `interface extends` copies the operation into each extending interface
    // and runs its decorators again. So one declaration reaches two channels,
    // and the declaration name alone cannot key either copy.
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      interface Base {
        @send op publish(event: OrderCreated): void;
      }

      @channel("orders.eu")
      interface Eu extends Base {}

      @channel("orders.us")
      interface Us extends Base {}
    `);

    const doc = documentFrom(runner.program);

    expect(diagnostics).toEqual([]);
    expect(Object.keys(doc.operations ?? {})).toEqual(["Eu_publish", "Us_publish"]);
    expect(doc.operations?.Eu_publish.channel).toEqual({ $ref: "#/channels/orders.eu" });
    expect(doc.operations?.Us_publish.channel).toEqual({ $ref: "#/channels/orders.us" });
  });

  it("keys an operation declared with `is` by its own name", async () => {
    // `op x is y` writes a declaration of its own, so its name is unique
    // where it sits. Only a copy made by `extends` needs the interface name.
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      interface Base {
        op publish(event: OrderCreated): void;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send op republish is Base.publish;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(Object.keys(doc.operations ?? {})).toEqual(["republish"]);
  });

  it("reports an operation whose channel lost an id clash", async () => {
    // The channel was dropped, so a reference to it would point at nothing.
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.first", "orders")
      interface First {
        @send op first(event: OrderCreated): void;
      }

      @channel("orders.second", "orders")
      interface Second {
        @send op second(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(findDiagnostic(diagnostics, "operation-without-channel").message).toContain("'second'");
    expect(Object.keys(doc.operations ?? {})).toEqual(["first"]);
  });

  it("reports a second @send and keeps the first", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @send("second")
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    findDiagnostic(diagnostics, "duplicate-send-decorator");
    // Decorators run bottom-up, so the one written last runs first and wins.
    expect(Object.keys(doc.operations ?? {})).toEqual(["second"]);
  });

  it("reports a second @receive and keeps the first", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @receive
        @receive
        op consume(): OrderCreated;
      }
    `);

    const doc = documentFrom(runner.program);

    findDiagnostic(diagnostics, "duplicate-receive-decorator");
    expect(doc.operations?.consume.action).toBe("receive");
  });

  it("reports @send together with @receive and emits no operation", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @receive
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    findDiagnostic(diagnostics, "conflicting-operation-actions");
    expect(doc.operations).toEqual({});
  });

  it("reports both mistakes when one operation carries three applications", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        @send
        @receive
        op publish(event: OrderCreated): void;
      }
    `);

    expect(findDiagnostic(diagnostics, "duplicate-send-decorator").severity).toBe("error");
    expect(findDiagnostic(diagnostics, "conflicting-operation-actions").severity).toBe("error");
  });

  it("reports nothing at all for a program that exercises every operation field", async () => {
    // Every other test here names one diagnostic and looks for it. None of
    // them can see a diagnostic the emitter reports that nobody asked for. An
    // error-severity one stops the compiler from writing the file, so the
    // whole phase can be broken end to end while every test stays green.
    await runner.compile(`
      @service(#{ title: "Orders" })
      @securityScheme("op-token", #{ type: "httpApiKey", name: "x-token", in: "header" })
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
        @send("orders.create.send")
        @useSecurity("op-token")
        @replyChannel(ReplyChannel)
        @replyAddress("$message.header#/replyTo")
        @summary("Create an order")
        @doc("Sends one command per order.")
        @asyncTag("orders")
        @externalDocs("https://example.com/orders")
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    const doc = documentFrom(runner.program);

    // The build reports into the same list, so it is read after the build.
    expect(runner.program.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);

    // The emitted key order is user-visible YAML and JSON, and the builder
    // states that it follows the Operation Object table of the specification.
    // Every other assertion here uses `toEqual`, which ignores key order, so
    // the order is pinned once on the fixture that carries every field.
    const operation = doc.operations?.["orders.create.send"];
    expect(Object.keys(operation ?? {})).toEqual([
      "action",
      "channel",
      "title",
      "description",
      "security",
      "tags",
      "externalDocs",
      "messages",
      "reply",
    ]);
    expect(Object.keys(operation?.reply ?? {})).toEqual(["address", "channel", "messages"]);
  });

  it("keeps an operation key that is a prototype property name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send("__proto__") op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(Object.hasOwn(doc.operations ?? {}, "__proto__")).toBe(true);
  });
});
