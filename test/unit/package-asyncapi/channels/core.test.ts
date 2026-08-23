import { describe, it, expect, beforeEach } from "vitest";
import { TesterInstance } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { $lib } from "#core/lib.js";
import { diagnosticsWith, findDiagnostic, targetText } from "../../../utils/diagnostics.js";
import { documentFrom, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { channelsOf } from "../../../utils/document.js";

describe("Unit: Channels (Phase 4.1)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("keys the channel by its address and emits the address", async () => {
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

    const doc = documentFrom(runner.program);

    expect(channelsOf(doc)["orders.created"]).toEqual({
      address: "orders.created",
      messages: { OrderCreated: { $ref: "#/components/messages/OrderCreated" } },
    });
  });

  it("keys the channel by the explicit id argument", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created", "orders")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(Object.keys(channelsOf(doc))).toEqual(["orders"]);
  });

  it("declares a channel on a namespace", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      namespace Orders {
        op publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(channelsOf(doc)["orders.created"].address).toBe("orders.created");
    expect(channelsOf(doc)["orders.created"].messages).toEqual({
      OrderCreated: { $ref: "#/components/messages/OrderCreated" },
    });
  });

  it("does not let a namespace channel reach a nested interface's operations", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      namespace Orders {
        interface Inner {
          publish(event: OrderCreated): void;
        }
      }
    `);

    const doc = documentFrom(runner.program);

    expect(channelsOf(doc)["orders.created"].messages).toBeUndefined();
    expect(diagnosticsWith(diagnostics, "channel-no-messages").length).toBeGreaterThan(0);
  });

  it("emits an empty channels map when the program declares no channel", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;
    `);

    const doc = documentFrom(runner.program);

    expect(channelsOf(doc)).toEqual({});
  });

  it("emits address null for a dynamic channel", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        receive(response: OrderAccepted): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(channelsOf(doc).ReplyChannel.address).toBeNull();
    expect(channelsOf(doc).ReplyChannel).not.toHaveProperty("parameters");
  });

  it("keys a dynamic channel by the explicit id argument", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel("replies")
      interface ReplyChannel {
        receive(response: OrderAccepted): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(Object.keys(channelsOf(doc))).toEqual(["replies"]);
  });

  it("accepts a full URL as an address", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Tick {
        at: string;
      }

      @channel("wss://example.com/socket")
      interface Socket {
        receive(event: Tick): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(channelsOf(doc)["wss://example.com/socket"].address).toBe("wss://example.com/socket");
  });

  it("trims the address before it is stored", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Tick {
        at: string;
      }

      @channel("  orders.created  ")
      interface Ticks {
        receive(event: Tick): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(channelsOf(doc)["orders.created"].address).toBe("orders.created");
  });

  it("rejects a blank address", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("   ")
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/empty-channel-address");
    expect(documentFrom(runner.program).channels).toEqual({});
  });

  it("rejects a blank explicit channel id", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.created", "  ")
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/empty-channel-id");
    expect(documentFrom(runner.program).channels).toEqual({});
  });

  it("rejects a blank explicit id on a dynamic channel", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @dynamicChannel("")
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/empty-channel-id");
    expect(documentFrom(runner.program).channels).toEqual({});
  });

  it("rejects an address that carries a query string", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders?filter=new")
      interface Broken {}
    `);

    const reported = diagnosticsWith(diagnostics, "invalid-channel-address");
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toMatch(/query/);
    expect(documentFrom(runner.program).channels).toEqual({});
  });

  it("rejects an address that carries a fragment", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders#recent")
      interface Broken {}
    `);

    const reported = diagnosticsWith(diagnostics, "invalid-channel-address");
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toMatch(/fragment/);
  });

  it("rejects an address with unbalanced braces", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.{orderId")
      interface Broken {}
    `);

    const reported = diagnosticsWith(diagnostics, "invalid-channel-address");
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toMatch(/unbalanced/);
  });

  it("rejects an address with nested braces", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.{a{b}}")
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-channel-address");
  });

  it("rejects an address with a closing brace that opens nothing", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.orderId}")
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-channel-address");
  });

  it("rejects a parameter name outside the address parameter charset", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.{order id}")
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-channel-param-name");
    expect(documentFrom(runner.program).channels).toEqual({});
  });

  it("rejects an empty parameter name", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.{}")
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/invalid-channel-param-name");
  });

  it("reports a second @channel on one interface", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.created")
      @channel("orders.updated")
      interface Broken {}
    `);

    const doc = documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/duplicate-channel-decorator");
    // One application still wins, so the channel is emitted. Decorators on
    // one declaration run bottom-up, and the first to run claims the target,
    // so the application written last in the source is the one that wins.
    expect(Object.keys(channelsOf(doc))).toEqual(["orders.updated"]);
    expect(channelsOf(doc)["orders.updated"].address).toBe("orders.updated");
  });

  it("reports a second @dynamicChannel on one interface", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @dynamicChannel
      @dynamicChannel
      interface Broken {}
    `);

    const doc = documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain(
      "tsp-asyncapi/duplicate-dynamic-channel-decorator",
    );
    // The first application to run still claims the target, so one dynamic
    // channel is emitted.
    expect(Object.keys(channelsOf(doc))).toEqual(["Broken"]);
    expect(channelsOf(doc).Broken.address).toBeNull();
  });

  it("reports the conflict once and the extra @channel on its own", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.created")
      @channel("orders.updated")
      @dynamicChannel
      interface Broken {}
    `);

    const conflicts = diagnosticsWith(diagnostics, "conflicting-channel-decorators");
    const duplicates = diagnosticsWith(diagnostics, "duplicate-channel-decorator");

    // Three applications make two mistakes. The two kinds together are one
    // conflict, whatever the number of applications, and the second @channel
    // is a duplicate of the first. Reporting the conflict per losing
    // application would repeat one message and hide the duplicate.
    expect(conflicts).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(documentFrom(runner.program).channels).toEqual({});
  });

  it("points an address problem at the address argument", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders?filter=new", "orders")
      interface Broken {}
    `);

    const reported = findDiagnostic(diagnostics, "invalid-channel-address");

    // The two arguments sit next to each other, so the code alone does not
    // say which one the author has to change.
    expect(targetText(reported)).toBe(`"orders?filter=new"`);
  });

  it("points a channel id problem at the id argument", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.created", "  ")
      interface Broken {}
    `);

    const reported = findDiagnostic(diagnostics, "empty-channel-id");

    expect(targetText(reported)).toBe(`"  "`);
  });

  it("points a dynamic channel id problem at its only argument", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @dynamicChannel("")
      interface Broken {}
    `);

    const reported = findDiagnostic(diagnostics, "empty-channel-id");

    // `@dynamicChannel` carries no address, so its id is the first argument
    // rather than the second.
    expect(targetText(reported)).toBe(`""`);
  });

  it("points a parameter name problem at the address argument", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.{order id}", "orders")
      interface Broken {}
    `);

    const reported = findDiagnostic(diagnostics, "invalid-channel-param-name");

    expect(targetText(reported)).toBe(`"orders.{order id}"`);
  });

  it("declares each channel diagnostic at the severity its handling needs", () => {
    // An error breaks a build and a warning does not. Downgrading any of
    // these to a warning would let a document that names a channel nothing
    // can address reach a consumer, and every other test here would stay
    // green. So each severity is pinned on its own.
    const expected = {
      "empty-channel-address": "error",
      "invalid-channel-address": "error",
      "invalid-channel-param-name": "error",
      "empty-channel-id": "error",
      "duplicate-channel-decorator": "error",
      "duplicate-dynamic-channel-decorator": "error",
      "conflicting-channel-decorators": "error",
      "duplicate-channel-id": "error",
      "missing-channel-param": "error",
      "unused-channel-param": "error",
      "non-string-channel-param": "error",
      "optional-channel-param": "error",
      "conflicting-channel-param": "error",
      "duplicate-parameter-location-decorator": "error",
      "invalid-parameter-location": "error",
      "channel-no-messages": "warning",
      "duplicate-use-server": "warning",
      "use-server-without-channel": "warning",
      "unserializable-example": "warning",
    } as const;

    const declared = Object.fromEntries(
      Object.keys(expected).map((code) => [
        code,
        $lib.diagnostics[code as keyof typeof expected].severity,
      ]),
    );

    expect(declared).toEqual(expected);
  });

  it("keeps a channel id such as __proto__ as an own key of the map", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created", "__proto__")
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `);

    const channels = documentFrom(runner.program).channels;

    // The map is built with `Object.fromEntries`, so the id becomes an own
    // property. An assignment would write to the prototype instead, and the
    // channel would vanish from the emitted map.
    expect(diagnostics).toEqual([]);
    expect(Object.keys(channels ?? {})).toEqual(["__proto__"]);
    expect(Object.hasOwn(channels ?? {}, "__proto__")).toBe(true);
  });

  it("drops both channels when @channel and @dynamicChannel meet", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @channel("orders.created")
      @dynamicChannel
      interface Broken {}
    `);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/conflicting-channel-decorators");
    expect(documentFrom(runner.program).channels).toEqual({});
  });

  it("keeps the first channel in source order when two claim one id", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.first", "orders")
      interface First {
        publish(event: OrderCreated): void;
      }

      @channel("orders.second", "orders")
      interface Second {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    expect(diagnostics.map((d) => d.code)).toContain("tsp-asyncapi/duplicate-channel-id");
    expect(Object.keys(channelsOf(doc))).toEqual(["orders"]);
    expect(channelsOf(doc).orders.address).toBe("orders.first");
  });

  it("reports nothing for a plain parameter of a dynamic channel", async () => {
    const diagnostics = await runner.diagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderAccepted {
        id: string;
      }

      @dynamicChannel
      interface ReplyChannel {
        receive(correlationKey: string, response: OrderAccepted): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // A dynamic channel has no address, so a declaration cannot be matched
    // against one. Reporting the parameter as unused would ask the author to
    // add `{correlationKey}` to an address the channel does not have.
    expect(diagnostics).toEqual([]);
    expect(channelsOf(doc).ReplyChannel).not.toHaveProperty("parameters");
  });

  it("ranks two files by import order when their channels claim one id", async () => {
    const tester = AsyncAPITester.files({
      // The name sorts before `main.tsp`, so a comparison by path text would
      // make this file win. Files are ranked by the order the compiler
      // reached them instead, and `main.tsp` is always the first of those.
      "a-extra.tsp": `
        using AsyncAPI;
        namespace Test;

        @message
        model Late {
          id: string;
        }

        @channel("orders.late", "orders")
        interface LateChannel {
          publish(event: Late): void;
        }
      `,
    }).import("./a-extra.tsp");

    const result = await tester.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Early {
        id: string;
      }

      @channel("orders.early", "orders")
      interface EarlyChannel {
        publish(event: Early): void;
      }
    `);

    const doc = documentFrom(result.program);

    expect(Object.keys(channelsOf(doc))).toEqual(["orders"]);
    expect(channelsOf(doc).orders.address).toBe("orders.early");
  });

  it("keeps the channels map in the source order of the declarations", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("zzz.first")
      interface Zeta {
        publish(event: OrderCreated): void;
      }

      @channel("aaa.second")
      interface Alpha {
        publish(event: OrderCreated): void;
      }
    `);

    const doc = documentFrom(runner.program);

    // The ids run against the alphabet, so this input fails if the map is
    // ever sorted by name. It fails too if the entries are reversed. Every
    // other test here declares one channel, where no order is visible.
    expect(Object.keys(channelsOf(doc))).toEqual(["zzz.first", "aaa.second"]);
  });
});

describe("Unit: Channels — one address on two channels", () => {
  /**
   * AsyncAPI allows two channels to share an address, because their ids
   * differ. The document stays valid. What a reader cannot tell is which set
   * of messages that one address carries, because the address is what exists
   * at run time and the id is not.
   *
   * The address is the default key, so one channel needs an explicit id.
   * Without it, the two collide on the key and the second one is dropped.
   */
  it("warns when two channels carry the same address", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message model Placed { id: string; }
      @message model Shipped { id: string; }

      @channel("orders") interface Publishing {
        @send op publish(m: Placed): void;
      }
      @channel("orders", "watching") interface Watching {
        @receive op watch(): Shipped;
      }
    `);

    const reported = diagnosticsWith(diagnostics, "duplicate-channel-address");
    // Only the second channel is reported. One mistake, one report.
    expect(reported).toHaveLength(1);
    expect(reported[0].severity).toBe("warning");
  });

  it("does not warn about two dynamic channels", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message model Placed { id: string; }
      @message model Shipped { id: string; }

      @dynamicChannel interface First {
        @send op publish(m: Placed): void;
      }
      @dynamicChannel interface Second {
        @receive op watch(): Shipped;
      }
    `);

    // Their address is `null` because it is unknown until run time, so two of
    // them state nothing about each other.
    expect(diagnosticsWith(diagnostics, "duplicate-channel-address")).toHaveLength(0);
  });

  it("does not warn when two channels carry different addresses", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message model Placed { id: string; }

      @channel("orders.placed") interface A {
        @send op publish(m: Placed): void;
      }
      @channel("orders.shipped") interface B {
        @send op ship(m: Placed): void;
      }
    `);

    expect(diagnosticsWith(diagnostics, "duplicate-channel-address")).toHaveLength(0);
  });
});
