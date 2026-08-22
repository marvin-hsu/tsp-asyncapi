import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { findDiagnostic, targetText } from "../../../utils/diagnostics.js";
import { operationsOf } from "../../../utils/document.js";

const SERVICE = `
  @service(#{ title: "Sensors" })
  @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
  namespace Test;

  @message
  model Reading {
    value: float64;
  }
`;

describe("Unit: the @mqttOperation decorator", () => {
  it("emits every field with the binding version", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("sensors/readings")
      interface Readings {
        @mqttOperation(#{ qos: 2, retain: true, messageExpiryInterval: 300 })
        @send
        op publish(event: Reading): void;
      }
    `);

    expect(operationsOf(doc).publish.bindings).toEqual({
      mqtt: { qos: 2, retain: true, messageExpiryInterval: 300, bindingVersion: "0.2.0" },
    });
  });

  it("keeps a qos of zero", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("sensors/readings")
      interface Readings {
        @mqttOperation(#{ qos: 0 })
        @send
        op publish(event: Reading): void;
      }
    `);

    // Zero is at most once delivery, which is a real mode. A truthiness check
    // would drop it and leave the document claiming the default instead.
    expect(operationsOf(doc).publish.bindings?.mqtt).toEqual({ qos: 0, bindingVersion: "0.2.0" });
  });

  it("keeps a retain of false", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("sensors/readings")
      interface Readings {
        @mqttOperation(#{ retain: false })
        @send
        op publish(event: Reading): void;
      }
    `);

    // `false` says the broker must not retain. That is the opposite of saying
    // nothing, so it has to reach the document.
    expect(operationsOf(doc).publish.bindings?.mqtt).toEqual({
      retain: false,
      bindingVersion: "0.2.0",
    });
  });

  it("reports a qos outside the three MQTT defines, and keeps the rest", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("sensors/readings")
      interface Readings {
        @mqttOperation(#{ qos: 3, retain: true })
        @send
        op publish(event: Reading): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("qos");
    expect(reported.message).toContain("0, 1, 2");
    expect(reported.message).toContain("mqtt binding field");
    expect(operationsOf(doc).publish.bindings?.mqtt).toEqual({
      retain: true,
      bindingVersion: "0.2.0",
    });
    // The squiggle sits on the config literal, not on the whole operation.
    expect(targetText(reported)).toBe("#{ qos: 3, retain: true }");
  });

  it("accepts a message expiry written as a schema", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @channel("sensors/readings")
      interface Readings {
        @mqttOperation(#{ messageExpiryInterval: #{ type: "integer", minimum: 60 } })
        @send
        op publish(event: Reading): void;
      }
    `);

    // MQTT 5 types the field as a number or a Schema Object. A schema says
    // what the value may be rather than what it is.
    expect(operationsOf(doc).publish.bindings?.mqtt.messageExpiryInterval).toEqual({
      type: "integer",
      minimum: 60,
    });
  });

  it("reports a message expiry that is neither a number nor a schema", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("sensors/readings")
      interface Readings {
        @mqttOperation(#{ messageExpiryInterval: "300" })
        @send
        op publish(event: Reading): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("messageExpiryInterval");
    expect(reported.message).toContain("a number or a schema object");
  });

  it("reports a binding on an operation that neither sends nor receives", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @channel("sensors/readings")
      interface Readings {
        @mqttOperation(#{ qos: 1 })
        op notAnOperation(event: Reading): void;
      }
    `);

    // The binding reaches no part of the document. Dropping it in silence
    // would leave the author believing the delivery mode was set.
    const reported = findDiagnostic(diagnostics, "binding-outside-document");
    expect(reported.message).toContain("mqtt");
  });
});
