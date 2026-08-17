# AMQP

AMQP binding。輸出的成員是 `amqp`，每個物件都帶 `bindingVersion: 0.3.0`。

## `@amqpChannel`

```typespec
extern dec amqpChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIAmqpChannelBinding
);
```

| 欄位       | 型別                   | 必填 |
| ---------- | ---------------------- | ---- |
| `is`       | `string`               | 否   |
| `exchange` | `AsyncAPIAmqpExchange` | 否   |
| `queue`    | `AsyncAPIAmqpQueue`    | 否   |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

::: warning
`is` 是 TypeSpec 的保留字。欄位名稱要用反引號寫成 `` `is`: "routingKey" ``。輸出的成員仍然是 `is`。
:::

`is` 是 `queue` 或 `routingKey`。`exchange.type` 是 `topic`、`direct`、`fanout`、`default`、`headers` 其中之一。exchange 或 queue 的名稱最長 255 個字元。

這個成員涵蓋 AMQP 0-9-1。AsyncAPI 另外定義 `amqp1` 給 AMQP 1.0，本 library 不輸出它。

```typespec
@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "events", type: "topic", durable: true }
})
@channel("events.created")
interface EventChannel {}
```

## `@amqpOperation`

```typespec
extern dec amqpOperation(target: Operation, config: valueof AsyncAPIAmqpOperationBinding);
```

| 欄位           | 型別       | 必填 |
| -------------- | ---------- | ---- |
| `expiration`   | `int32`    | 否   |
| `userId`       | `string`   | 否   |
| `cc`           | `string[]` | 否   |
| `priority`     | `int32`    | 否   |
| `deliveryMode` | `int32`    | 否   |
| `mandatory`    | `boolean`  | 否   |
| `bcc`          | `string[]` | 否   |
| `timestamp`    | `boolean`  | 否   |
| `ack`          | `boolean`  | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`deliveryMode` 為 `1` 表示暫存，`2` 表示持久化。`expiration` 是毫秒數，不會是負數。

輸出的欄位順序依照規格，不是作者書寫的順序。

## `@amqpMessage`

```typespec
extern dec amqpMessage(target: Model, config: valueof AsyncAPIAmqpMessageBinding);
```

| 欄位              | 型別     | 必填 |
| ----------------- | -------- | ---- |
| `contentEncoding` | `string` | 否   |
| `messageType`     | `string` | 否   |

套用在同時帶有 `@message` 的 model 上。AMQP 對這兩個欄位都沒有規定值的集合。
