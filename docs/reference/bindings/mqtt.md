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

`lastWill` is the message the broker sends when the client goes away without saying goodbye. Its `qos` is `0`, `1` or `2`. A value outside that is reported and dropped, and the rest of the will is kept.

`sessionExpiryInterval` and `maximumPacketSize` are MQTT 5 fields. Write each one as a number, or as a Schema Object describing the number.

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

`qos` is `0`, `1` or `2`. Any other value is reported and dropped.

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
