import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { findDiagnostic } from "../../../utils/diagnostics.js";
import { messagesOf } from "../../../utils/document.js";

const SERVICE = `
  @service(#{ title: "Sensors" })
  @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
  namespace Test;
`;

const CHANNEL = `
  @channel("sensors/readings")
  interface Readings {
    @send
    op publish(event: Reading): void;
  }
`;

describe("Unit: the @mqttMessage decorator", () => {
  it("emits every field with the binding version", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @mqttMessage(#{
        payloadFormatIndicator: 1,
        correlationData: #{ type: "string", format: "uuid" },
        contentType: "application/json",
        responseTopic: "sensors/ack",
      })
      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    expect(messagesOf(doc).Reading.bindings).toEqual({
      mqtt: {
        payloadFormatIndicator: 1,
        correlationData: { type: "string", format: "uuid" },
        contentType: "application/json",
        responseTopic: "sensors/ack",
        bindingVersion: "0.2.0",
      },
    });
  });

  it("keeps a payload format indicator of zero", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @mqttMessage(#{ payloadFormatIndicator: 0 })
      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    // Zero says the payload is unspecified bytes. That is one of the two
    // formats MQTT 5 defines, not an absent field.
    expect(messagesOf(doc).Reading.bindings?.mqtt).toEqual({
      payloadFormatIndicator: 0,
      bindingVersion: "0.2.0",
    });
  });

  it("reports a payload format indicator outside the two MQTT 5 defines", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @mqttMessage(#{ payloadFormatIndicator: 2, contentType: "application/json" })
      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("payloadFormatIndicator");
    expect(reported.message).toContain("0, 1");
    expect(messagesOf(doc).Reading.bindings?.mqtt).toEqual({
      contentType: "application/json",
      bindingVersion: "0.2.0",
    });
  });

  it("accepts a response topic written as a schema", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @mqttMessage(#{ responseTopic: #{ type: "string", pattern: "^sensors/" } })
      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    // MQTT types the field as a topic name or a Schema Object. Kafka has no
    // field shaped this way, so the check is its own.
    expect(messagesOf(doc).Reading.bindings?.mqtt.responseTopic).toEqual({
      type: "string",
      pattern: "^sensors/",
    });
  });

  it("reports a response topic that is neither a name nor a schema", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @mqttMessage(#{ responseTopic: 42 })
      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("responseTopic");
    expect(reported.message).toContain("a topic name or a schema object");
  });

  it("drops a blank response topic rather than emitting one", async () => {
    const doc = await emitDocument(`
      ${SERVICE}

      @mqttMessage(#{ responseTopic: "   ", contentType: "application/json" })
      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    // A blank topic names nothing. Emitting it would send replies to a topic
    // whose name is spaces.
    expect(messagesOf(doc).Reading.bindings?.mqtt).toEqual({
      contentType: "application/json",
      bindingVersion: "0.2.0",
    });
  });

  it("reports correlation data that is not a schema", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @mqttMessage(#{ correlationData: "uuid" })
      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    // MQTT types this one as a schema only. A bare string is not one, and
    // accepting it would write a document the parser rejects.
    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("correlationData");
    expect(reported.message).toContain("a schema object");
  });

  it("reports a binding on a model that carries no @message", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${SERVICE}

      @mqttMessage(#{ contentType: "application/json" })
      model NotAMessage {
        value: float64;
      }

      @message
      model Reading {
        value: float64;
      }

      ${CHANNEL}
    `);

    const reported = findDiagnostic(diagnostics, "binding-outside-document");
    expect(reported.message).toContain("mqtt");
  });
});
