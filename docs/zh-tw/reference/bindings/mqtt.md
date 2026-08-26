---
title: "MQTT"
description: "MQTT binding。輸出的成員是 `mqtt`，每個物件都帶 `bindingVersion: 0.2.0`。"
---

# MQTT

MQTT binding。輸出的成員是 `mqtt`，每個物件都帶 `bindingVersion: 0.2.0`。

## `@mqttServer`

```typespec
extern dec mqttServer(target: Namespace, config: valueof AsyncAPIMqttServerBinding);
```

| 欄位                    | 型別                   | 必填 |
| ----------------------- | ---------------------- | ---- |
| `clientId`              | `string`               | 否   |
| `cleanSession`          | `boolean`              | 否   |
| `lastWill`              | `AsyncAPIMqttLastWill` | 否   |
| `keepAlive`             | `int32`                | 否   |
| `sessionExpiryInterval` | `unknown`              | 否   |
| `maximumPacketSize`     | `unknown`              | 否   |

套用在服務 namespace 上。該 namespace 宣告的每一個 server 各拿到一份。

`lastWill` 是用戶端未告別就離線時，broker 代發的訊息。它的 `qos` 是 `0`、`1` 或 `2`。超出範圍的值會被回報並丟棄，遺言的其餘欄位保留。

`sessionExpiryInterval` 與 `maximumPacketSize` 是 MQTT 5 欄位。寫成數字，或寫成描述該數字的 Schema Object。

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

| 欄位                    | 型別      | 必填 |
| ----------------------- | --------- | ---- |
| `qos`                   | `int32`   | 否   |
| `retain`                | `boolean` | 否   |
| `messageExpiryInterval` | `unknown` | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`qos` 是 `0`、`1` 或 `2`。其他值會被回報並丟棄。

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

| 欄位                     | 型別      | 必填 |
| ------------------------ | --------- | ---- |
| `payloadFormatIndicator` | `int32`   | 否   |
| `correlationData`        | `unknown` | 否   |
| `contentType`            | `string`  | 否   |
| `responseTopic`          | `unknown` | 否   |

套用在同時帶有 `@message` 的 model 上。四個欄位都是 MQTT 5 欄位。

`payloadFormatIndicator` 為 `0` 表示未指定的位元組，`1` 表示 UTF-8。`correlationData` 是 Schema Object。`responseTopic` 是 topic 名稱，或描述該名稱的 Schema Object。

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
