import { describe, expect, it } from "vitest";
import {
  buildAsyncAPIWithDiagnostics,
  emitDocument,
  emitDocumentWithDiagnostics,
} from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { channelsOf, serversOf } from "../../utils/document.js";

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
      const doc = await emitDocument(`
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

      expect(serversOf(doc).prod.bindings).toEqual({
        pulsar: { tenant: "orders", bindingVersion: "0.1.0" },
      });
    });
  });

  describe("@pulsarChannel", () => {
    it("emits every field with the binding version", async () => {
      const doc = await emitDocument(`
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

      expect(channelsOf(doc)["orders.created"].bindings).toEqual({
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
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{ persistence: "persistent" })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      // AsyncAPI requires the field. A binding emitted without it would fail
      // validation with a message about this emitter rather than the source.
      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("namespace");
      expect(reported.severity).toBe("error");
      expect(channelsOf(doc)["orders.created"].bindings).toBeUndefined();
    });

    it("drops the whole binding when the persistence is missing", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @pulsarChannel(#{ \`namespace\`: "orders" })
        @channel("orders.created")
        interface OrderChannel {
          ${OPERATION}
        }
      `);

      const reported = findDiagnostic(diagnostics, "missing-binding-field");
      expect(reported.message).toContain("persistence");
      expect(channelsOf(doc)["orders.created"].bindings).toBeUndefined();
    });

    it("drops the whole binding when the persistence is not one Pulsar defines", async () => {
      const { doc, diagnostics } = await buildAsyncAPIWithDiagnostics(`
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
      const invalid = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(invalid.message).toContain("persistent or non-persistent");
      findDiagnostic(diagnostics, "missing-binding-field");
      expect(channelsOf(doc)["orders.created"].bindings).toBeUndefined();
    });

    it("names both required fields when both are missing", async () => {
      const { diagnostics } = await buildAsyncAPIWithDiagnostics(`
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
      const doc = await emitDocument(`
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
      expect(channelsOf(doc)["orders.created"].bindings?.pulsar.retention).toEqual({ time: 0 });
    });

    it("reports a negative retention and keeps the binding", async () => {
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
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

      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("retention.time");
      // The two required fields are still there, so the binding survives.
      expect(channelsOf(doc)["orders.created"].bindings?.pulsar.retention).toEqual({ size: 1000 });
    });

    it("drops a retention policy left with nothing in it", async () => {
      const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
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

      findDiagnostic(diagnostics, "invalid-binding-field");
      expect(channelsOf(doc)["orders.created"].bindings?.pulsar).toEqual({
        namespace: "orders",
        persistence: "persistent",
        bindingVersion: "0.1.0",
      });
    });

    it("drops the blank entries of the replication list", async () => {
      const doc = await emitDocument(`
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

      expect(channelsOf(doc)["orders.created"].bindings?.pulsar["geo-replication"]).toEqual([
        "us-east",
      ]);
    });

    it("reports a negative compaction threshold", async () => {
      const { diagnostics } = await emitDocumentWithDiagnostics(`
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

      const reported = findDiagnostic(diagnostics, "invalid-binding-field");
      expect(reported.message).toContain("compaction");
      expect(reported.message).toContain("zero or more");
    });
  });
});
