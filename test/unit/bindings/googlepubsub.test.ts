/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPI } from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { buildAsyncAPIDocument } from "../../../src/pipeline.js";

/**
 * Builds a document from source, ignoring the error severity.
 *
 * A missing required field is an error, and the emitter writes no file once
 * one is reported. The message promises the binding alone was dropped, so a
 * test has to look at the document to show that the rest survived.
 */
async function buildWithDiagnostics(code: string) {
  const runner = await AsyncAPITester.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(code);
  return { doc: buildAsyncAPIDocument(runner.program, undefined, {}), diagnostics };
}

const SERVICE = `
  @service(#{ title: "Orders" })
  @server("prod", #{ host: "pubsub.googleapis.com", protocol: "googlepubsub" })
  namespace Test;

  @message
  model OrderCreated {
    orderId: string;
  }
`;

const OPERATION = `
  @send
  op publish(event: OrderCreated): void;
`;

const SETTINGS = `#{ encoding: "json", name: "projects/p/schemas/order" }`;

describe("Unit: the Google Cloud Pub/Sub binding decorators", () => {
  describe("@googlePubSubChannel", () => {
    it("emits every field with the binding version", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @googlePubSubChannel(#{
          schemaSettings: #{
            encoding: "json",
            name: "projects/p/schemas/order",
            firstRevisionId: "rev-1",
            lastRevisionId: "rev-9",
          },
          labels: #{ team: "orders", tier: "gold" },
          messageRetentionDuration: "86400s",
          messageStoragePolicy: #{ allowedPersistenceRegions: #["us-central1"] },
        })
        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.channels.OrderChannel.bindings).toEqual({
        googlepubsub: {
          schemaSettings: {
            encoding: "json",
            name: "projects/p/schemas/order",
            firstRevisionId: "rev-1",
            lastRevisionId: "rev-9",
          },
          labels: { team: "orders", tier: "gold" },
          messageRetentionDuration: "86400s",
          messageStoragePolicy: { allowedPersistenceRegions: ["us-central1"] },
          bindingVersion: "0.2.0",
        },
      });
    });

    it("drops the whole binding when the schema settings are missing", async () => {
      const { doc, diagnostics } = await buildWithDiagnostics(`
        ${SERVICE}

        @googlePubSubChannel(#{ messageRetentionDuration: "86400s" })
        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/missing-binding-field");
      expect(reported.message).toContain("schemaSettings");
      expect(reported.severity).toBe("error");
      expect(doc.channels?.OrderChannel.bindings).toBeUndefined();
    });

    it("names both fields the schema settings require when neither is given", async () => {
      const { doc, diagnostics } = await buildWithDiagnostics(`
        ${SERVICE}

        @googlePubSubChannel(#{ schemaSettings: #{ firstRevisionId: "rev-1" } })
        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // Reporting only the first would send the author round the loop twice.
      const missing = diagnostics.filter((d) => d.code === "tsp-asyncapi/missing-binding-field");
      expect(missing).toHaveLength(2);
      expect(missing.map((d) => d.message).join(" ")).toContain("schemaSettings.encoding");
      expect(missing.map((d) => d.message).join(" ")).toContain("schemaSettings.name");
      expect(doc.channels?.OrderChannel.bindings).toBeUndefined();
    });

    it("treats a blank required field as absent", async () => {
      const { diagnostics } = await buildWithDiagnostics(`
        ${SERVICE}

        @googlePubSubChannel(#{
          schemaSettings: #{ encoding: "json", name: "   " },
        })
        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // A name of spaces names no schema, so it is worth no more than an
      // absent field.
      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/missing-binding-field");
      expect(reported.message).toContain("schemaSettings.name");
    });

    it("drops an empty label map rather than emitting one", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @googlePubSubChannel(#{ schemaSettings: ${SETTINGS}, labels: #{} })
        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.channels.OrderChannel.bindings.googlepubsub).toEqual({
        schemaSettings: { encoding: "json", name: "projects/p/schemas/order" },
        bindingVersion: "0.2.0",
      });
    });

    it("drops a storage policy that lists no region", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @googlePubSubChannel(#{
          schemaSettings: ${SETTINGS},
          messageStoragePolicy: #{ allowedPersistenceRegions: #["  "] },
        })
        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // An empty policy states no restriction, which is what an absent field
      // already says.
      expect("messageStoragePolicy" in doc.channels.OrderChannel.bindings.googlepubsub).toBe(false);
    });
  });

  describe("@googlePubSubMessage", () => {
    it("emits every field with the binding version", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "pubsub.googleapis.com", protocol: "googlepubsub" })
        namespace Test;

        @googlePubSubMessage(#{
          attributes: #{ source: "checkout" },
          orderingKey: "customer-id",
          schema: #{ name: "projects/p/schemas/order" },
        })
        @message
        model OrderCreated {
          orderId: string;
        }

        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.components.messages.OrderCreated.bindings).toEqual({
        googlepubsub: {
          attributes: { source: "checkout" },
          orderingKey: "customer-id",
          schema: { name: "projects/p/schemas/order" },
          bindingVersion: "0.2.0",
        },
      });
    });

    it("reports a schema written without a name, and keeps the rest", async () => {
      const { doc, diagnostics } = await buildWithDiagnostics(`
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "pubsub.googleapis.com", protocol: "googlepubsub" })
        namespace Test;

        @googlePubSubMessage(#{ orderingKey: "customer-id", schema: #{} })
        @message
        model OrderCreated {
          orderId: string;
        }

        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // The object itself is optional, so only it goes. The binding still
      // says how the messages are ordered.
      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/missing-binding-field");
      expect(reported.message).toContain("schema.name");
      expect(doc.components?.messages?.OrderCreated.bindings).toEqual({
        googlepubsub: { orderingKey: "customer-id", bindingVersion: "0.2.0" },
      });
    });

    it("emits the binding version on its own when no field was written", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @server("prod", #{ host: "pubsub.googleapis.com", protocol: "googlepubsub" })
        namespace Test;

        @googlePubSubMessage(#{})
        @message
        model OrderCreated {
          orderId: string;
        }

        @channel("orders-created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // No field of the message binding is required, unlike the channel one.
      expect(doc.components.messages.OrderCreated.bindings.googlepubsub).toEqual({
        bindingVersion: "0.2.0",
      });
    });
  });
});
