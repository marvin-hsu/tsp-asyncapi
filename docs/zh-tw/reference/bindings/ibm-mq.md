---
title: "IBM MQ"
description: "IBM MQ binding。輸出的成員是 `ibmmq`，每個物件都帶 `bindingVersion: 0.1.0`。"
---

# IBM MQ

IBM MQ binding。輸出的成員是 `ibmmq`，每個物件都帶 `bindingVersion: 0.1.0`。

## `@ibmMqServer`

```typespec
extern dec ibmMqServer(target: Namespace, config: valueof AsyncAPIIbmMqServerBinding);
```

| 欄位                   | 型別      | 必填 |
| ---------------------- | --------- | ---- |
| `groupId`              | `string`  | 否   |
| `ccdtQueueManagerName` | `string`  | 否   |
| `cipherSpec`           | `string`  | 否   |
| `multiEndpointServer`  | `boolean` | 否   |
| `heartBeatInterval`    | `int32`   | 否   |

套用在服務 namespace 上。

`heartBeatInterval` 的範圍是 0 到 999999 秒。

AsyncAPI 規定 `cipherSpec` 只在 server 使用 TLS 時適用。emitter 不檢查這一點，因為這條規則跨兩個物件。

```typespec
@service(#{ title: "Orders" })
@server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
@ibmMqServer(#{ groupId: "PRODGRP", cipherSpec: "ANY_TLS12", heartBeatInterval: 300 })
namespace Orders;
```

```yaml
servers:
  prod:
    host: mq.example.com:1414
    protocol: ibmmq
    bindings:
      ibmmq:
        groupId: PRODGRP
        cipherSpec: ANY_TLS12
        heartBeatInterval: 300
        bindingVersion: 0.1.0
```

## `@ibmMqChannel`

```typespec
extern dec ibmMqChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIIbmMqChannelBinding
);
```

| 欄位              | 型別              | 必填 |
| ----------------- | ----------------- | ---- |
| `destinationType` | `string`          | 否   |
| `queue`           | `Record<unknown>` | 否   |
| `topic`           | `Record<unknown>` | 否   |
| `maxMsgLength`    | `int32`           | 否   |

`destinationType` 是 `topic` 或 `queue`。`maxMsgLength` 的範圍是 0 到 104857600 位元組，也就是 100 MB。

AsyncAPI 規定 `queue` 只在型別為 `queue` 時適用，`topic` 只在型別為 `topic` 時適用。emitter 不檢查這個配對。

```typespec
@ibmMqChannel(#{
  destinationType: "queue",
  queue: #{ objectName: "ORDERS.IN" },
  maxMsgLength: 4194304
})
@channel("orders.in")
interface OrderChannel {}
```

```yaml
channels:
  orders.in:
    address: orders.in
    bindings:
      ibmmq:
        destinationType: queue
        queue:
          objectName: ORDERS.IN
        maxMsgLength: 4194304
        bindingVersion: 0.1.0
```

## `@ibmMqMessage`

```typespec
extern dec ibmMqMessage(target: Model, config: valueof AsyncAPIIbmMqMessageBinding);
```

| 欄位          | 型別     | 必填 |
| ------------- | -------- | ---- |
| `type`        | `string` | 否   |
| `headers`     | `string` | 否   |
| `description` | `string` | 否   |
| `expiry`      | `int32`  | 否   |

`type` 是 `string`、`jms` 或 `binary`。`expiry` 是毫秒數，不會是負數。零表示訊息永不過期。

`headers` 是以逗號分隔的標頭名稱清單，不是 Schema Object。IBM MQ 是這個 library 裡唯一這樣定義該欄位的 binding。

IBM MQ 只允許 binary payload 帶 `headers`。搭配其他 `type` 寫下去時，會透過 `invalid-binding-field` 回報，該欄位被丟棄，binding 的其餘欄位保留。

```typespec
@message
@ibmMqMessage(#{
  type: "binary",
  headers: "JMSCorrelationID,JMSType",
  expiry: 60000
})
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      payload:
        $ref: "#/components/schemas/OrderCreated"
      bindings:
        ibmmq:
          type: binary
          headers: JMSCorrelationID,JMSType
          expiry: 60000
          bindingVersion: 0.1.0
```
