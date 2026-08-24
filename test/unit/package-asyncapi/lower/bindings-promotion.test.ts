import { describe, expect, it } from "vitest";
import { emitDocument } from "../../../utils/test-host.js";
import { channelsOf, messagesOf, operationsOf, serversOf } from "../../../utils/document.js";
import { validateAsyncAPI } from "../../../utils/spec-validation.js";

/**
 * Where a Bindings Object is written.
 *
 * A Bindings Object has no name of its own. Its config arrives as a
 * `valueof` object value, and an `ObjectValue` carries no pointer back to a
 * declaration, so this emitter cannot tell `#{ … }` written in place from a
 * named constant. The second use is therefore the evidence that a component
 * saves anything.
 *
 * ## The unit of sharing is the whole object
 *
 * `serverBindingsObject.json` gives `properties.jms` no `oneOf Reference`, so
 * a `$ref` is legal at `server.bindings` and rejected at
 * `server.bindings.jms`. Each test here validates against the official
 * parser, which is what holds that line.
 */
describe("Unit: promoting bindings into components", () => {
  it("shares one Bindings Object between the servers of a namespace", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      @server("production", #{ host: "a.example.com", protocol: "kafka" })
      @server("sit", #{ host: "b.example.com", protocol: "kafka" })
      namespace Test;

      @message
      model Placed {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;
      }
    `);

    expect(doc.components?.serverBindings).toStrictEqual({
      production: {
        kafka: {
          schemaRegistryUrl: "https://registry.example.com",
          bindingVersion: "0.5.0",
        },
      },
    });
    const reference = { $ref: "#/components/serverBindings/production" };
    expect(serversOf(doc).production.bindings).toStrictEqual(reference);
    expect(serversOf(doc).sit.bindings).toStrictEqual(reference);
    expect(await validateAsyncAPI(doc)).toBeNull();
  });

  /** One site has nothing to share with, so it writes the object itself. */
  it("leaves a Bindings Object one site carries where it is", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      @server("production", #{ host: "a.example.com", protocol: "kafka" })
      namespace Test;

      @message
      model Placed {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;
      }
    `);

    expect(doc.components?.serverBindings).toBeUndefined();
    expect(serversOf(doc).production.bindings).toStrictEqual({
      kafka: {
        schemaRegistryUrl: "https://registry.example.com",
        bindingVersion: "0.5.0",
      },
    });
  });

  /**
   * The four sections are separate maps in the specification, and a Bindings
   * Object on a channel means something other than the same one on a message.
   * So sharing never crosses them, even when the two are byte-identical.
   */
  it("keeps the four sections apart", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @kafkaMessage(#{ schemaIdLocation: "payload" })
      model Placed {
        id: string;
      }

      @message
      @kafkaMessage(#{ schemaIdLocation: "payload" })
      model Shipped {
        id: string;
      }

      @channel("orders")
      @kafkaChannel(#{ topic: "orders" })
      interface OrderChannel {
        @send
        op place(event: Placed): void;

        @send
        op ship(event: Shipped): void;
      }

      @channel("orders.audit")
      @kafkaChannel(#{ topic: "orders" })
      interface AuditChannel {
        @send
        op audit(event: Placed): void;
      }
    `);

    // Each pair repeats within its own section, and neither pair reaches the
    // other's map.
    expect(Object.keys(doc.components?.messageBindings ?? {})).toStrictEqual(["Placed"]);
    expect(Object.keys(doc.components?.channelBindings ?? {})).toStrictEqual(["orders"]);
    expect(messagesOf(doc).Shipped.bindings).toStrictEqual({
      $ref: "#/components/messageBindings/Placed",
    });
    expect(channelsOf(doc)["orders.audit"].bindings).toStrictEqual({
      $ref: "#/components/channelBindings/orders",
    });
    expect(await validateAsyncAPI(doc)).toBeNull();
  });

  it("shares an operation Bindings Object between two operations", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Placed {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        @send
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        op place(event: Placed): void;

        @send
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        op replay(event: Placed): void;
      }
    `);

    expect(Object.keys(doc.components?.operationBindings ?? {})).toStrictEqual(["place"]);
    const reference = { $ref: "#/components/operationBindings/place" };
    expect(operationsOf(doc).place.bindings).toStrictEqual(reference);
    expect(operationsOf(doc).replay.bindings).toStrictEqual(reference);
    expect(await validateAsyncAPI(doc)).toBeNull();
  });
});
