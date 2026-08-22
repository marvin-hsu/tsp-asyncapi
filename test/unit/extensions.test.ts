/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import {
  buildAsyncAPIWithDiagnostics,
  emitAsyncAPI,
  emitAsyncAPIWithDiagnostics,
} from "../utils/test-host.js";
import { findDiagnostic, targetText } from "../utils/diagnostics.js";

/**
 * Unit tests of `@extension`, the `x-` specification extensions.
 *
 * Every case reads the emitted document rather than the state. Where an
 * extension lands is the whole of the feature, and only the document shows
 * it.
 */

const MESSAGE = `
  @message
  model OrderCreated {
    orderId: string;
  }
`;

const OPERATION = `
  @send
  op publish(event: OrderCreated): void;
`;

describe("Unit: @extension", () => {
  describe("the four targets", () => {
    it("puts an extension on the service namespace into info", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @extension("x-owner", "orders-team")
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.info["x-owner"]).toBe("orders-team");
    });

    it("puts an extension on a @channel interface into that channel", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        @extension("x-topic-owner", "platform")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.channels.orders["x-topic-owner"]).toBe("platform");
    });

    it("puts an extension on an operation into that operation", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          @send
          @extension("x-sla-ms", 250)
          op publish(event: OrderCreated): void;
        }
      `);

      expect(doc.operations.publish["x-sla-ms"]).toBe(250);
    });

    it("puts an extension on a @message model into that message", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message
        @extension("x-schema-id", 4711)
        model OrderCreated {
          orderId: string;
        }

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.components.messages.OrderCreated["x-schema-id"]).toBe(4711);
    });
  });

  describe("value marshalling", () => {
    it("emits a nested object, an array, and the three primitives as written", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @extension("x-object", #{
          team: "orders",
          contact: #{ slack: "#orders", pager: #["primary", "secondary"] }
        })
        @extension("x-array", #["a", 1, true, #{ nested: "deep" }])
        @extension("x-string", "plain")
        @extension("x-number", 3.5)
        @extension("x-boolean", false)
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.info["x-object"]).toEqual({
        team: "orders",
        contact: { slack: "#orders", pager: ["primary", "secondary"] },
      });
      expect(doc.info["x-array"]).toEqual(["a", 1, true, { nested: "deep" }]);
      expect(doc.info["x-string"]).toBe("plain");
      expect(doc.info["x-number"]).toBe(3.5);
      // A `false` must survive. An emitter that drops the empty values would
      // lose it, and no other primitive shows that.
      expect(doc.info["x-boolean"]).toBe(false);
    });

    // A member named `__proto__` is lost before this emitter sees the value.
    // The compiler marshals an object value by assigning each member in turn,
    // and that assignment writes the prototype instead of adding the member.
    // So the argument that reaches `@extension` already holds `ok` alone.
    // This case states what the author asked for, and fails until the
    // compiler stops losing the name. Reported upstream as
    // microsoft/typespec#11743.
    it.fails("emits a member named __proto__ as a real key", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @extension("x-thing", #{ \`__proto__\`: "written", ok: 1 })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const thing: Record<string, unknown> = doc.info["x-thing"];
      expect(Object.keys(thing)).toEqual(["__proto__", "ok"]);
      expect(Object.getOwnPropertyDescriptor(thing, "__proto__")?.value).toBe("written");
    });

    it("keeps the rest of an object value that names a member __proto__", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @extension("x-thing", #{ \`__proto__\`: #{ polluted: true }, ok: 1 })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // The marshaller left that member on the prototype of the argument.
      // Reading own members only keeps it out of the document, so the loss
      // stays a loss and never becomes a stray key.
      const thing: Record<string, unknown> = doc.info["x-thing"];
      expect(Object.keys(thing)).toEqual(["ok"]);
      expect(Object.hasOwn(thing, "polluted")).toBe(false);
    });
  });

  describe("more than one key on one target", () => {
    it("emits every key, in source order, after the specification fields", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @info(#{ version: "2.0.0" })
        @extension("x-second", 2)
        @extension("x-third", 3)
        @extension("x-first", 1)
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // The order is where the applications were written, not the order the
      // compiler ran them in, and not alphabetical. The specification fields
      // come first, because an `x-` key can never collide with one.
      const info: Record<string, unknown> = doc.info;
      expect(Object.keys(info)).toEqual(["title", "version", "x-second", "x-third", "x-first"]);
    });
  });

  describe("diagnostics", () => {
    // Both error cases read the document that `buildAsyncAPIWithDiagnostics`
    // builds, because an error stops the emitter from writing a file. That
    // builder is given no service, so it emits a stub `info`. So these two
    // cases put their keys on the channel instead.

    it("reports a key without the x- prefix and keeps the other applications", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        @extension("owner", "orders-team")
        @extension("x-owner", "orders-team")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-extension-key");
      expect(reported.severity).toBe("error");
      expect(reported.message).toContain("owner");
      // The squiggle sits on the key argument, not on the interface.
      expect(targetText(reported)).toBe(`"owner"`);
      // `ChannelObject` accepts an `x-` key alone, so a bare `owner` cannot
      // be read as a property. The key list shows it never arrived.
      const channel = doc.channels?.orders;
      expect(Object.keys(channel ?? {})).not.toContain("owner");
      expect(channel?.["x-owner"]).toBe("orders-team");
    });

    it("reports a repeated key and keeps the first one in source order", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        @extension("x-owner", "first")
        @extension("x-owner", "second")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/duplicate-extension-key");
      expect(reported.severity).toBe("error");
      expect(reported.message).toContain("x-owner");
      // The squiggle sits on the losing application's key argument.
      expect(targetText(reported)).toBe(`"x-owner"`);
      expect(doc.channels?.orders["x-owner"]).toBe("first");
    });

    it("reports a repeated key once when the target emits two objects", async () => {
      const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        @channel("orders")
        @extension("x-owner", "first")
        @extension("x-owner", "second")
        namespace Test;

        ${MESSAGE}

        ${OPERATION}
      `);

      // This namespace emits both `info` and a Channel Object. One clash is
      // one author mistake, so it gets one report, not one per object.
      const reported = diagnostics.filter(
        (diagnostic) => diagnostic.code === "tsp-asyncapi/duplicate-extension-key",
      );
      expect(reported).toHaveLength(1);
    });

    it("reports a key that the specification pattern rejects", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        @extension("x-", "bare")
        @extension("x-has space", "spaced")
        @extension("x-kept", "yes")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // The pattern is `^x-[\\w\\d.\\-_]+$`. A bare prefix has no name after
      // it, and a space is outside the charset. The official parser rejects
      // both, so neither may reach the document.
      const reported = diagnostics.filter(
        (diagnostic) => diagnostic.code === "tsp-asyncapi/invalid-extension-key",
      );
      expect(reported).toHaveLength(2);
      expect(reported.every((diagnostic) => diagnostic.severity === "error")).toBe(true);
      const channel = doc.channels?.orders;
      expect(Object.keys(channel ?? {})).not.toContain("x-");
      expect(Object.keys(channel ?? {})).not.toContain("x-has space");
      expect(channel?.["x-kept"]).toBe("yes");
    });

    it("keeps quiet about a message model a key collision dropped", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message("Envelope")
        @extension("x-owner", "team")
        model Envelope<T> {
          body: T;
        }

        @channel("first")
        interface First {
          @send
          op publishFirst(event: Envelope<string>): void;
        }

        @channel("second")
        interface Second {
          @send
          op publishSecond(event: Envelope<int32>): void;
        }
      `);

      // Both instantiations claim the key `Envelope`, so only the first one
      // becomes a Message Object. The extension of the losing instantiation
      // still reached the document through the winner.
      expect(doc.components.messages.Envelope["x-owner"]).toBe("team");
      const reported = diagnostics.filter(
        (diagnostic) => diagnostic.code === "tsp-asyncapi/extension-target-not-emitted",
      );
      expect(reported).toHaveLength(0);
    });

    it("reports an extension on a target that emits no object", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        // A model without @message emits no Message Object, so this key
        // reaches no part of the document.
        @extension("x-owner", "orders-team")
        model Unused {
          id: string;
        }

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/extension-target-not-emitted");
      expect(reported.severity).toBe("warning");
      // A warning leaves the document standing, and nothing in it carries
      // the dropped key.
      expect(JSON.stringify(doc)).not.toContain("x-owner");
    });

    it("reports one target once, however many keys it carries", async () => {
      const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @extension("x-one", 1)
        @extension("x-two", 2)
        model Unused {
          id: string;
        }

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = diagnostics.filter(
        (diagnostic) => diagnostic.code === "tsp-asyncapi/extension-target-not-emitted",
      );
      expect(reported).toHaveLength(1);
    });

    it("keeps quiet about an operation declared in a base interface", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        interface Base {
          @extension("x-sla-ms", 250)
          @send
          op publish(event: OrderCreated): void;
        }

        @channel("orders.created")
        interface OrderChannel extends Base {}
      `);

      // The compiler copies the operation into the extending interface. The
      // declaration in `Base` sits on no channel, and it reaches the document
      // through the copy. Its extension did too.
      expect(doc.operations.OrderChannel_publish["x-sla-ms"]).toBe(250);
      const reported = diagnostics.filter(
        (diagnostic) => diagnostic.code === "tsp-asyncapi/extension-target-not-emitted",
      );
      expect(reported).toHaveLength(0);
    });

    it("keeps quiet about a channel an id collision dropped", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        @extension("x-owner", "team")
        interface Chan<T> {
          @send
          op publish(event: OrderCreated, extra: T): void;
        }

        alias First = Chan<string>;
        alias Second = Chan<int32>;
      `);

      // Both instantiations claim the id `orders`, so only the first one
      // becomes a Channel Object. The extension of the losing instantiation
      // still reached the document through the winner. The clash itself is
      // already reported once.
      expect(doc.channels.orders["x-owner"]).toBe("team");
      expect(
        diagnostics.filter((diagnostic) => diagnostic.code === "tsp-asyncapi/duplicate-channel-id"),
      ).toHaveLength(1);
      expect(
        diagnostics.filter(
          (diagnostic) => diagnostic.code === "tsp-asyncapi/extension-target-not-emitted",
        ),
      ).toHaveLength(0);
    });

    it("reports a value the serializer cannot represent and drops the key", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        @extension("x-ip", Test.ipv4.fromBytes(1, 2, 3, 4))
        @extension("x-after", "kept")
        namespace Test;

        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/unserializable-extension");
      expect(reported.severity).toBe("warning");
      // The squiggle sits on the value argument, not on the namespace.
      expect(targetText(reported)).toBe("Test.ipv4.fromBytes(1, 2, 3, 4)");
      // A dropped application leaves no key behind, and the ones beside it
      // still arrive.
      expect(Object.keys(doc.info as Record<string, unknown>)).not.toContain("x-ip");
      expect(doc.info["x-after"]).toBe("kept");
    });

    it("reports an unrepresentable array element and writes no null", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        @extension("x-list", #[Test.ipv4.fromBytes(1, 2, 3, 4), "ok"])
        @extension("x-after", "kept")
        namespace Test;

        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/unserializable-extension");
      expect(reported.severity).toBe("warning");
      // A hole in an array reaches the writer as `null`, so the whole
      // application is dropped instead.
      expect(Object.keys(doc.info as Record<string, unknown>)).not.toContain("x-list");
      expect(doc.info["x-after"]).toBe("kept");
    });

    it("reports an unrepresentable object member and drops the whole value", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        @extension("x-obj", #{ ip: Test.ipv4.fromBytes(1, 2, 3, 4), ok: "yes" })
        @extension("x-after", "kept")
        namespace Test;

        scalar ipv4 extends string {
          init fromBytes(a: uint8, b: uint8, c: uint8, d: uint8);
        }

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/unserializable-extension");
      expect(reported.severity).toBe("warning");
      // A truncated object claims the author wrote fewer members than they
      // did, so nothing is written.
      expect(Object.keys(doc.info as Record<string, unknown>)).not.toContain("x-obj");
      expect(doc.info["x-after"]).toBe("kept");
    });

    it("keeps an object member the author left out", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @extension("x-obj", #{ ok: "yes" })
        namespace Test;

        ${MESSAGE}

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // An absent member is not a serializer failure, so the value survives.
      expect(doc.info["x-obj"]).toEqual({ ok: "yes" });
    });

    it("reports misplaced targets in source order", async () => {
      const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
        @service(#{ title: "Orders" })
        namespace Test;

        ${MESSAGE}

        @extension("x-owner", "first")
        model AlphaUnused {
          id: string;
        }

        // Checking this model reaches the next one, so the compiler runs the
        // decorators of the next one first.
        @extension("x-owner", "second")
        model BetaUnused {
          inner: GammaUnused;
        }

        @extension("x-owner", "third")
        model GammaUnused {
          id: string;
        }

        @channel("orders")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // The state map hands the targets over in decorator run order. An
      // author reads the file top to bottom, so the reports follow that.
      const names = diagnostics
        .filter((diagnostic) => diagnostic.code === "tsp-asyncapi/extension-target-not-emitted")
        .map((diagnostic) => /model (\w+)/.exec(targetText(diagnostic))?.[1]);
      expect(names).toEqual(["AlphaUnused", "BetaUnused", "GammaUnused"]);
    });
  });

  describe("a target that emits more than one object", () => {
    it("puts the keys of a service namespace that is also a channel into both", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @channel("orders")
        @extension("x-owner", "orders-team")
        namespace Test;

        ${MESSAGE}

        ${OPERATION}
      `);

      expect(doc.info["x-owner"]).toBe("orders-team");
      expect(doc.channels.orders["x-owner"]).toBe("orders-team");
    });
  });
});
