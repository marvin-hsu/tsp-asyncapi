---
title: "MQTT"
description: "The MQTT binding. The emitted member is `mqtt`, and every object carries `bindingVersion: 0.2.0`."
---

# MQTT

The MQTT binding. The emitted member is `mqtt`, and every object carries `bindingVersion: 0.2.0`.

## `@mqttServer`

```typespec
extern dec mqttServer(target: Namespace, config: valueof AsyncAPIMqttServerBinding);
```

| Field                   | Type                   | Required |
| ----------------------- | ---------------------- | -------- |
| `clientId`              | `string`               | no       |
| `cleanSession`          | `boolean`              | no       |
| `lastWill`              | `AsyncAPIMqttLastWill` | no       |
| `keepAlive`             | `int32`                | no       |
| `sessionExpiryInterval` | `unknown`              | no       |
| `maximumPacketSize`     | `unknown`              | no       |

Apply it to the service namespace. Every server that namespace declares gets its own copy.

`lastWill` is the message the broker sends when the client disconnects without a DISCONNECT packet. Its `qos` is `0`, `1` or `2`. Any other value is reported through `invalid-binding-field`. The field is dropped and the rest of the will is kept.

`sessionExpiryInterval` and `maximumPacketSize` are MQTT 5 fields. Write each one as a number, or as a Schema Object describing the number.

```typespec
@service(#{ title: "Sensors" })
@server("prod", #{ host: "mqtt.example.com:8883", protocol: "mqtt" })
@mqttServer(#{
  clientId: "sensor-gateway",
  cleanSession: true,
  keepAlive: 60,
  lastWill: #{ topic: "sensors/status", qos: 1, message: "offline", retain: true }
})
namespace Sensors;
```

```yaml
servers:
  prod:
    host: mqtt.example.com:8883
    protocol: mqtt
    bindings:
      mqtt:
        clientId: sensor-gateway
        cleanSession: true
        lastWill:
          topic: sensors/status
          qos: 1
          message: offline
          retain: true
        keepAlive: 60
        bindingVersion: 0.2.0
```

## `@mqttOperation`

```typespec
extern dec mqttOperation(target: Operation, config: valueof AsyncAPIMqttOperationBinding);
```

| Field                   | Type      | Required |
| ----------------------- | --------- | -------- |
| `qos`                   | `int32`   | no       |
| `retain`                | `boolean` | no       |
| `messageExpiryInterval` | `unknown` | no       |

Apply it to an operation that carries `@send` or `@receive`.

`qos` is `0`, `1` or `2`. Any other value is reported through `invalid-binding-field`. The field is dropped and the rest of the binding is kept.

```typespec
@send
@mqttOperation(#{ qos: 1, retain: false, messageExpiryInterval: 3600 })
op publish(event: Reading): void;
```

```yaml
operations:
  publish:
    action: send
    channel:
      $ref: "#/channels/sensors~1reading"
    bindings:
      mqtt:
        qos: 1
        retain: false
        messageExpiryInterval: 3600
        bindingVersion: 0.2.0
```

## `@mqttMessage`

```typespec
extern dec mqttMessage(target: Model, config: valueof AsyncAPIMqttMessageBinding);
```

| Field                    | Type      | Required |
| ------------------------ | --------- | -------- |
| `payloadFormatIndicator` | `int32`   | no       |
| `correlationData`        | `unknown` | no       |
| `contentType`            | `string`  | no       |
| `responseTopic`          | `unknown` | no       |

Apply it to a model that also carries `@message`. All four fields are MQTT 5 fields.

`payloadFormatIndicator` is `0` for unspecified bytes and `1` for UTF-8. `correlationData` is a Schema Object. `responseTopic` is a topic name, or a Schema Object describing the name.

```typespec
@message
@mqttMessage(#{
  payloadFormatIndicator: 1,
  contentType: "application/json",
  responseTopic: "sensors/reply"
})
model Reading {
  value: float64;
}
```

```yaml
components:
  messages:
    Reading:
      name: Reading
      payload:
        $ref: "#/components/schemas/Reading"
      bindings:
        mqtt:
          payloadFormatIndicator: 1
          contentType: application/json
          responseTopic: sensors/reply
          bindingVersion: 0.2.0
```
