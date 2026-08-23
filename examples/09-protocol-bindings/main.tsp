// The MQTT bindings, on a device-telemetry service. They land on a server, an
// operation and a message here. The channel carries none, because the MQTT
// binding specification says its channel object must hold no property at all.
//
// Example 08 shows the four Kafka decorators. This one shows two things Kafka
// cannot: a protocol whose levels are a different set, and the generic
// `@binding` beside the named decorators, on the one kind of name that still
// needs it.
import "tsp-asyncapi";

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
// Every server of this namespace gets its own copy. `@server` is repeatable
// and keyed by name, so no decorator target can single one server out. This
// namespace declares one server, so one copy is written.
//
// `bindingVersion: 0.2.0` is written for you. Each named decorator knows which
// version of the binding its fields come from, so you never write it and can
// never write the wrong one.
//
// `lastWill.qos` is checked. MQTT allows 0, 1 and 2. Write 3 and the emitter
// reports `invalid-binding-field`, drops that one field, and keeps the rest of
// the will.
@mqttServer(#{
  clientId: "telemetry-gateway",
  cleanSession: false,
  keepAlive: 60,
  lastWill: #{
    topic: "devices/status",
    qos: 1,
    message: "gateway offline",
    retain: false,
  },
  sessionExpiryInterval: 3600,
})
namespace DeviceTelemetry;

/**
 * One reading from one device.
 */
// `payloadFormatIndicator`, `contentType` and `responseTopic` are MQTT 5
// fields. The broker above declares `protocolVersion: "5.0"`, so all three
// apply. `payloadFormatIndicator` is 0 for bytes and 1 for UTF-8, and no
// other value is accepted.
@mqttMessage(#{
  payloadFormatIndicator: 1,
  contentType: "application/json",
  responseTopic: "devices/commands",
})
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
// This channel carries no MQTT binding, and there is no `@mqttChannel` to
// write. Version 0.2.0 of the MQTT binding reserves its channel object for
// future use and says it must contain no property, `bindingVersion` included.
//
// The generic `@binding` is here instead, on a name AsyncAPI reserves but
// gives no fields: `stomp`. That is what `@binding` is for now. It cannot
// carry a protocol of your own invention, because the member names of a
// Bindings Object are a closed list and a parser rejects anything outside it.
// A name of your own has to start with `x-`.
@binding("stomp", #{})
@channel("devices/{deviceId}/telemetry")
@useServer("mqtt-prod")
interface DeviceTelemetryChannel {
  // `qos`, `retain` and `messageExpiryInterval` are the three fields the MQTT
  // operation binding defines. `retain` only means anything on a send, which
  // AsyncAPI states and this emitter does not check, because the rule spans
  // the operation and its action.
  @mqttOperation(#{ qos: 1, retain: false, messageExpiryInterval: 300 })
  @send("publishDeviceReading")
  op publish(
    /** The serial number of the device. */
    @parameterLocation("$message.payload#/deviceId")
    @example("dev-00417")
    deviceId: string,

    event: DeviceReading,
  ): void;
}
