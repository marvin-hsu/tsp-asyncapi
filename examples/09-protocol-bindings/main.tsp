// The generic `@binding`, on an MQTT device-telemetry service. It lands on a
// server, an operation and a message here. The channel carries none, because
// MQTT defines no channel binding.
// Example 08 uses the four Kafka decorators. This library ships no decorator
// for MQTT, WebSocket, AMQP or HTTP. `@binding` carries those protocols.
// It is the escape hatch, and it checks nothing.
import "../..";

using AsyncAPI;

@service(#{ title: "Device Telemetry" })
@info(#{
  version: "1.0.0",
  description: "Telemetry that field devices publish over MQTT.",
})
@server(
  "mqtt-prod",
  #{
    host: "mqtt.example.com:8883",
    protocol: "mqtt",
    protocolVersion: "5.0",
    title: "Production broker",
  }
)
// The server binding. `@binding` names no level of its own. The level comes
// from the target. This namespace carries `@service` and no `@channel`, so
// the binding reaches the servers alone.
// Every server of this namespace gets its own copy of the binding. `@server`
// is repeatable and keyed by name, so no decorator target can single one
// server out. This namespace declares one server, so one copy is written.
// Write `bindingVersion` yourself. `@binding` adds none, because it never
// reads the shape of the config. `0.2.0` is the version of the MQTT bindings
// these fields belong to.
@binding(
  "mqtt",
  #{
    clientId: "telemetry-gateway",
    cleanSession: false,
    keepAlive: 60,
    lastWill: #{
      topic: "devices/status",
      qos: 1,
      message: "gateway offline",
      retain: false,
    },
    bindingVersion: "0.2.0",
  }
)
namespace DeviceTelemetry;

/**
 * One reading from one device.
 */
// The message binding. The target is a model that carries `@message`, so the
// binding lands on the message object.
// `payloadFormatIndicator`, `contentType` and `responseTopic` are MQTT 5
// fields. The broker above declares `protocolVersion: "5.0"`, so all three
// apply.
@binding(
  "mqtt",
  #{
    payloadFormatIndicator: 1,
    contentType: "application/json",
    responseTopic: "devices/commands",
    bindingVersion: "0.2.0",
  }
)
@message
model DeviceReading {
  /** The serial number of the device. */
  deviceId: string;

  /** The temperature at the sensor, in degrees Celsius. */
  celsius: float64;

  /** When the device took the reading, in UTC. */
  readAt: utcDateTime;
}

/**
 * The telemetry of one device.
 */
// This channel carries no binding. Read the binding specification of your
// protocol before you write the fields.
// MQTT version `0.2.0` reserves its channel binding object for future use.
// That object must contain no property at all. `bindingVersion` is a
// property, so even the version is not allowed here.
// The emitter enforces none of that. It reads no schema for a raw binding,
// and it checks nothing inside the config. Write `qos` here and the emitter
// writes it here. `qos` is an MQTT operation field, not a channel field.
@channel("devices/{deviceId}/telemetry")
@useServer("mqtt-prod")
interface DeviceTelemetryChannel {
  // The operation binding. The target is an operation, so the binding lands
  // on the operation object. `qos`, `retain` and `messageExpiryInterval` are
  // the three fields the MQTT operation binding defines.
  @binding("mqtt", #{ qos: 1, retain: false, messageExpiryInterval: 300, bindingVersion: "0.2.0" })
  @send("publishDeviceReading")
  op publish(
    /** The serial number of the device. */
    @parameterLocation("$message.payload#/deviceId")
    @example("dev-00417")
    deviceId: string,

    event: DeviceReading,
  ): void;
}
