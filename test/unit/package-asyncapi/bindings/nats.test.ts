import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { operationsOf } from "../../../utils/document.js";
import { findDiagnostic } from "../../../utils/diagnostics.js";
import { bindingsOf } from "../../../utils/document.js";

const SERVICE = `
  @service(#{ title: "Sensors" })
  @server("prod", #{ host: "nats.example.com:4222", protocol: "nats" })
  namespace Test;

  @message
  model Reading {
    value: float64;
  }
`;

describe("Unit: the @natsOperation decorator", () => {
  it("emits the queue group with the binding version", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{ queue: "readings-workers" })
        @receive
        op onReading(): Reading;
      }
    `);

    expect(operationsOf(doc).onReading.bindings).toEqual({
      nats: { queue: "readings-workers", bindingVersion: "0.1.0" },
    });
  });

  it("reports a queue group name longer than NATS allows", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{ queue: "${"q".repeat(256)}" })
        @receive
        op onReading(): Reading;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("queue");
    expect(reported.message).toContain("at most 255 characters");
    expect(reported.message).toContain("nats binding field");
  });

  it("accepts a queue group name of exactly the length NATS allows", async () => {
    const name = "q".repeat(255);
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{ queue: "${name}" })
        @receive
        op onReading(): Reading;
      }
    `);

    // The limit is inclusive. A 255-character name must not be rejected.
    expect(bindingsOf(operationsOf(doc).onReading.bindings).nats.queue).toBe(name);
  });

  it("emits the binding version on its own when no queue was written", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{})
        @receive
        op onReading(): Reading;
      }
    `);

    // NATS states no required field, but the member is still emitted.
    expect(bindingsOf(operationsOf(doc).onReading.bindings).nats).toEqual({
      bindingVersion: "0.1.0",
    });
  });
});
