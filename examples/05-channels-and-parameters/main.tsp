// Addressing: channel ids, templated addresses, and address parameters.
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Telemetry Service" })
@info(#{ version: "1.0.0", description: "Channel addressing, parameters and server selection." })
// One server, so the `@useServer` below has something to point at.
// Example 06 covers servers in full.
@server("edge", #{ host: "edge.example.com:9092", protocol: "kafka", title: "Edge broker" })
namespace TelemetryService;

enum Region {
  eu,
  us,
  ap,
}

@message
model DeviceReading {
  deviceId: string;
  celsius: float64;
  readAt: utcDateTime;
}

@message
model DeviceAlarm {
  deviceId: string;
  code: string;
}

/**
 * Readings from one device, in one region.
 */
// The address holds two `{name}` expressions. Each name must be declared by
// a parameter of an operation this channel owns. A name with no declaration
// is reported, and a declaration the address never uses is reported too.
// A parameter whose type carries `@message` is a message declaration, not an
// address parameter. So `event` takes no part in the matching.
//
// The signature rule of the two action decorators:
// For `@send` the parameters are the messages sent. The return type is the
// messages of the reply.
// For `@receive` the parameters are the messages of the reply. The return
// type is the messages received.
//
// The address parameters sit beside the message parameter here. An address
// parameter is one whose type carries no `@message`. That rule holds under
// either action.
@channel("telemetry.{region}.devices.{deviceId}.readings")
@useServer("edge")
interface DeviceReadings {
  @send
  op sendDeviceReading(
    /** The region the device reports from. */
    // The type is an enum, so the emitted parameter carries an `enum` array.
    // The default value fills the `default` field.
    @example(Region.eu)
    region: Region = Region.eu,

    /** The serial number of the device. */
    // `@parameterLocation` takes a runtime expression. It names where the
    // value sits at runtime. The emitter checks the shape of the expression
    // only.
    @parameterLocation("$message.payload#/deviceId")
    @example("dev-00417")
    deviceId: string,

    event: DeviceReading,
  ): void;
}

/**
 * Alarms raised by any device.
 */
// The second argument of `@channel` is the channel id. It overrides the key
// in the emitted `channels` map. Without it the key would be `DeviceAlarms`,
// the declaration name of the interface.
// The key of an emitted operation is the name of the operation, and that key
// is document-wide. So each operation below carries a name of its own.
@channel("telemetry.alarms", "device-alarms")
@useServer("edge")
interface DeviceAlarms {
  @send
  op sendDeviceAlarm(event: DeviceAlarm): void;
}

/**
 * A channel whose address the broker assigns at runtime.
 */
// `@dynamicChannel` declares a channel with no known address. The emitted
// channel carries the literal `address: null`, which AsyncAPI reads as
// "unknown".
// It is a separate decorator, and not a `@channel` with the address left
// out. That keeps "the address is unknown" apart from "the address was
// forgotten".
// The only argument is the channel id. It is not an address. It overrides the
// key in the emitted `channels` map, the way the second argument of
// `@channel` does. So the key here is `device-replies`, and not the
// declaration name `DeviceReplies`.
// This is the one channel here the application receives on, so its operation
// carries `@receive`. The return type is the messages received, so
// `DeviceAlarm` sits in the return type and not in a parameter.
@dynamicChannel("device-replies")
interface DeviceReplies {
  @receive
  op onDeviceReply(): DeviceAlarm;
}

/**
 * Firmware reports, on a channel that sits on a namespace.
 */
// A channel sits on an interface or on a namespace. A namespace nested
// inside another namespace is its own scope, so it can carry a channel of
// its own. The channel owns the operations declared directly inside it.
@channel("telemetry.firmware.{channelVersion}")
namespace Firmware {
  @message
  model FirmwareReport {
    deviceId: string;
    version: string;
  }

  @send
  op sendFirmwareReport(
    /** The version of the channel contract. */
    // A union of string literals also produces an `enum` array.
    channelVersion: "v1" | "v2" = "v2",

    event: FirmwareReport,
  ): void;
}
