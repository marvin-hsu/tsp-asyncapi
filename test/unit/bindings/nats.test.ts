/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";

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
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{ queue: "readings-workers" })
        @receive
        op onReading(): Reading;
      }
    `);

    expect(doc.operations.onReading.bindings).toEqual({
      nats: { queue: "readings-workers", bindingVersion: "0.1.0" },
    });
  });

  it("reports a queue group name longer than NATS allows", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{ queue: "${"q".repeat(256)}" })
        @receive
        op onReading(): Reading;
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("queue");
    expect(reported.message).toContain("at most 255 characters");
    expect(reported.message).toContain("nats binding field");
  });

  it("accepts a queue group name of exactly the length NATS allows", async () => {
    const name = "q".repeat(255);
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{ queue: "${name}" })
        @receive
        op onReading(): Reading;
      }
    `);

    // The limit is inclusive. An off-by-one check would reject a name NATS
    // accepts.
    expect(doc.operations.onReading.bindings.nats.queue).toBe(name);
  });

  it("emits the binding version on its own when no queue was written", async () => {
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @channel("sensors.readings")
      interface Readings {
        @natsOperation(#{})
        @receive
        op onReading(): Reading;
      }
    `);

    // The author asked for the binding, so the member is emitted. NATS states
    // no required field.
    expect(doc.operations.onReading.bindings.nats).toEqual({ bindingVersion: "0.1.0" });
  });
});
