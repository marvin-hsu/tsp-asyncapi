import { describe, expect, it } from "vitest";
import { emitDocument, emitDocumentWithDiagnostics } from "../../../../utils/test-host.js";
import { findDiagnostic } from "../../../../utils/diagnostics.js";
import { serversOf } from "../../../../utils/document.js";

const BODY = `
  @message
  model Reading {
    value: float64;
  }

  @channel("sensors/readings")
  interface Readings {
    @send
    op publish(event: Reading): void;
  }
`;

describe("Unit: the @mqttServer decorator", () => {
  it("emits every field with the binding version", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{
        clientId: "sensor-gateway",
        cleanSession: true,
        lastWill: #{ topic: "sensors/status", qos: 1, message: "offline", retain: true },
        keepAlive: 60,
        sessionExpiryInterval: 3600,
        maximumPacketSize: 65535,
      })
      @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      namespace Test;

      ${BODY}
    `);

    expect(serversOf(doc).prod.bindings).toEqual({
      mqtt: {
        clientId: "sensor-gateway",
        cleanSession: true,
        lastWill: { topic: "sensors/status", qos: 1, message: "offline", retain: true },
        keepAlive: 60,
        sessionExpiryInterval: 3600,
        maximumPacketSize: 65535,
        bindingVersion: "0.2.0",
      },
    });
  });

  it("gives every server of the namespace its own copy", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{ clientId: "sensor-gateway" })
      @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      @server("staging", #{ host: "mqtt.staging.example.com:1883", protocol: "mqtt" })
      namespace Test;

      ${BODY}
    `);

    // `@server` is repeatable and keyed by name, so no decorator target can
    // single one server out. Both therefore carry the binding.
    expect(serversOf(doc).prod.bindings?.mqtt.clientId).toBe("sensor-gateway");
    expect(serversOf(doc).staging.bindings?.mqtt.clientId).toBe("sensor-gateway");
  });

  it("reports a last will qos outside the three MQTT defines, and keeps the will", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{
        lastWill: #{ topic: "sensors/status", qos: 7, message: "offline" },
      })
      @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      namespace Test;

      ${BODY}
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("lastWill.qos");
    expect(reported.message).toContain("0, 1, 2");
    // The rejected field goes on its own. The rest of the will still says
    // which topic the broker posts to, and losing that as well would take
    // away something the author wrote correctly.
    expect(serversOf(doc).prod.bindings?.mqtt.lastWill).toEqual({
      topic: "sensors/status",
      message: "offline",
    });
  });

  it("keeps a last will retain of false", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{ lastWill: #{ topic: "sensors/status", retain: false } })
      @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      namespace Test;

      ${BODY}
    `);

    expect(serversOf(doc).prod.bindings?.mqtt.lastWill).toEqual({
      topic: "sensors/status",
      retain: false,
    });
  });

  it("drops a last will that has nothing left in it", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{ clientId: "gateway", lastWill: #{ qos: 9 } })
      @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      namespace Test;

      ${BODY}
    `);

    // The only field the will carried was rejected. An empty object states no
    // will at all, so emitting it would claim the client configured one.
    findDiagnostic(diagnostics, "invalid-binding-field");
    expect(serversOf(doc).prod.bindings?.mqtt).toEqual({
      clientId: "gateway",
      bindingVersion: "0.2.0",
    });
  });

  it("accepts a session expiry written as a schema", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{ sessionExpiryInterval: #{ type: "integer", minimum: 30 } })
      @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      namespace Test;

      ${BODY}
    `);

    expect(serversOf(doc).prod.bindings?.mqtt.sessionExpiryInterval).toEqual({
      type: "integer",
      minimum: 30,
    });
  });

  it("reports a maximum packet size that is neither a number nor a schema", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{ maximumPacketSize: "65535" })
      @server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      namespace Test;

      ${BODY}
    `);

    const reported = findDiagnostic(diagnostics, "invalid-binding-field");
    expect(reported.message).toContain("maximumPacketSize");
    expect(reported.message).toContain("a number or a schema object");
  });

  it("reports a binding on a namespace that declares no server", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{ clientId: "gateway" })
      namespace Test;

      ${BODY}
    `);

    const reported = findDiagnostic(diagnostics, "binding-outside-document");
    expect(reported.message).toContain("mqtt");
  });
});
