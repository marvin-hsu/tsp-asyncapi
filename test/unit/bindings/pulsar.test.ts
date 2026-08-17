/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
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
  @server("prod", #{ host: "pulsar.example.com:6650", protocol: "pulsar" })
  namespace Test;

  @message
  model OrderCreated {
    id: string;
  }
`;

const OPERATION = `
  @send
  op publish(event: OrderCreated): void;
`;

describe("Unit: the Pulsar binding decorators", () => {
  describe("@pulsarServer", () => {
    it("emits the tenant with the binding version", async () => {
      const doc = await emitAsyncAPI(`
        @service(#{ title: "Orders" })
        @pulsarServer(#{ tenant: "orders" })
        @server("prod", #{ host: "pulsar.example.com:6650", protocol: "pulsar" })
        namespace Test;

        @message
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.servers.prod.bindings).toEqual({
        pulsar: { tenant: "orders", bindingVersion: "0.1.0" },
      });
    });
  });

  describe("@pulsarChannel", () => {
    it("emits every field with the binding version", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @pulsarChannel(#{
          \`namespace\`: "orders",
          persistence: "persistent",
          compaction: 100,
          geoReplication: #["us-east", "eu-west"],
          retention: #{ time: 1440, size: 1000 },
          ttl: 3600,
          deduplication: true,
        })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.channels.OrderChannel.bindings).toEqual({
        pulsar: {
          namespace: "orders",
          persistence: "persistent",
          compaction: 100,
          // The author writes `geoReplication`, because a TypeSpec field name
          // cannot hold a dash. The document carries the name Pulsar gives it.
          "geo-replication": ["us-east", "eu-west"],
          retention: { time: 1440, size: 1000 },
          ttl: 3600,
          deduplication: true,
          bindingVersion: "0.1.0",
        },
      });
    });

    it("drops the whole binding when the namespace is missing", async () => {
      const { doc, diagnostics } = await buildWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{ persistence: "persistent" })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // AsyncAPI requires the field. A binding emitted without it would fail
      // validation with a message about this emitter rather than the source.
      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/missing-binding-field");
      expect(reported.message).toContain("namespace");
      expect(reported.severity).toBe("error");
      expect(doc.channels?.OrderChannel.bindings).toBeUndefined();
    });

    it("drops the whole binding when the persistence is missing", async () => {
      const { doc, diagnostics } = await buildWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{ \`namespace\`: "orders" })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/missing-binding-field");
      expect(reported.message).toContain("persistence");
      expect(doc.channels?.OrderChannel.bindings).toBeUndefined();
    });

    it("drops the whole binding when the persistence is not one Pulsar defines", async () => {
      const { doc, diagnostics } = await buildWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{ \`namespace\`: "orders", persistence: "durable" })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // A rejected value leaves the field absent, and the field is required.
      // Both reports reach the author: what was wrong, and what is now
      // missing because of it.
      const invalid = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
      expect(invalid.message).toContain("persistent or non-persistent");
      findDiagnostic(diagnostics, "tsp-asyncapi/missing-binding-field");
      expect(doc.channels?.OrderChannel.bindings).toBeUndefined();
    });

    it("names both required fields when both are missing", async () => {
      const { diagnostics } = await buildWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{ ttl: 3600 })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // Reporting only the first would send the author round the loop twice.
      const missing = diagnostics.filter((d) => d.code === "tsp-asyncapi/missing-binding-field");
      expect(missing).toHaveLength(2);
    });

    it("keeps a retention of zero", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @pulsarChannel(#{
          \`namespace\`: "orders",
          persistence: "persistent",
          retention: #{ time: 0 },
        })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // Zero disables retention on that measure, which is a statement rather
      // than an absent field.
      expect(doc.channels.OrderChannel.bindings.pulsar.retention).toEqual({ time: 0 });
    });

    it("reports a negative retention and keeps the binding", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{
          \`namespace\`: "orders",
          persistence: "persistent",
          retention: #{ time: -1, size: 1000 },
        })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
      expect(reported.message).toContain("retention.time");
      // The two required fields are still there, so the binding survives.
      expect(doc.channels.OrderChannel.bindings.pulsar.retention).toEqual({ size: 1000 });
    });

    it("drops a retention policy left with nothing in it", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{
          \`namespace\`: "orders",
          persistence: "persistent",
          retention: #{ time: -1 },
        })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
      expect(doc.channels.OrderChannel.bindings.pulsar).toEqual({
        namespace: "orders",
        persistence: "persistent",
        bindingVersion: "0.1.0",
      });
    });

    it("drops the blank entries of the replication list", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @pulsarChannel(#{
          \`namespace\`: "orders",
          persistence: "persistent",
          geoReplication: #["us-east", "  "],
        })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      expect(doc.channels.OrderChannel.bindings.pulsar["geo-replication"]).toEqual(["us-east"]);
    });

    it("reports a negative compaction threshold", async () => {
      const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{
          \`namespace\`: "orders",
          persistence: "persistent",
          compaction: -1,
        })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
      expect(reported.message).toContain("compaction");
      expect(reported.message).toContain("zero or more");
    });
  });
});
