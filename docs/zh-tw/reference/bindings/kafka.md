# Kafka

Kafka binding。輸出的成員是 `kafka`，每個物件都帶 `bindingVersion: 0.5.0`。

## `@kafkaServer`

```typespec
extern dec kafkaServer(target: Namespace, config: valueof AsyncAPIKafkaServerBinding);
```

| 欄位                   | 型別     | 必填 |
| ---------------------- | -------- | ---- |
| `schemaRegistryUrl`    | `string` | 否   |
| `schemaRegistryVendor` | `string` | 否   |

套用在 service namespace 上。

::: warning
該 namespace 宣告的每一個 server 各自取得一份 binding 副本。`@server` 可重複套用且以名稱為鍵，因此沒有任何 decorator target 能指定單一 server。這與 namespace 層級的 `security` 及 `externalDocs` 規則相同。同一個 namespace 的兩個 server 無法指定兩個不同的 schema registry。
:::

```typespec
@service(#{ title: "Orders" })
@server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
@kafkaServer(#{
  schemaRegistryUrl: "https://registry.example.com",
  schemaRegistryVendor: "confluent"
})
namespace Orders;
```

```yaml
servers:
  prod:
    host: kafka.example.com:9092
    protocol: kafka
    bindings:
      kafka:
        schemaRegistryUrl: https://registry.example.com
        schemaRegistryVendor: confluent
        bindingVersion: 0.5.0
```

## `@kafkaChannel`

```typespec
extern dec kafkaChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIKafkaChannelBinding
);
```

| 欄位                 | 型別              | 必填 |
| -------------------- | ----------------- | ---- |
| `topic`              | `string`          | 否   |
| `partitions`         | `int32`           | 否   |
| `replicas`           | `int32`           | 否   |
| `topicConfiguration` | `Record<unknown>` | 否   |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

`partitions` 與 `replicas` 是正整數。超出範圍的值會由 `invalid-binding-field` 回報。該欄位被丟棄，binding 的其餘欄位保留。

`topicConfiguration` 是開放的對應表。AsyncAPI 說明該物件可以帶額外屬性。Kafka 的 topic 設定名稱含有點號，因此像 `confluent.value.schema.validation` 這種廠商設定也合法。emitter 只檢查一個值。`cleanup.policy` 的項目必須是 `delete` 或 `compact`。binding 把該欄位定為清單。若只寫單一個值，emitter 會輸出成只有一項的清單。

```typespec
@kafkaChannel(#{
  topic: "orders.created",
  partitions: 12,
  replicas: 3,
  topicConfiguration: #{ `cleanup.policy`: #["compact"] }
})
@channel("orders.created")
interface OrderChannel {
  @send
  op publish(event: OrderCreated): void;
}
```

```yaml
channels:
  OrderChannel:
    address: orders.created
    bindings:
      kafka:
        topic: orders.created
        partitions: 12
        replicas: 3
        topicConfiguration:
          cleanup.policy:
            - compact
        bindingVersion: 0.5.0
```

## `@kafkaOperation`

```typespec
extern dec kafkaOperation(target: Operation, config: valueof AsyncAPIKafkaOperationBinding);
```

| 欄位       | 型別      | 必填 |
| ---------- | --------- | ---- |
| `groupId`  | `unknown` | 否   |
| `clientId` | `unknown` | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

兩個欄位都是 Schema Object。各自寫成物件字面值。emitter 原樣寫入文件。若值不是物件，由 `invalid-binding-field` 回報。

```typespec
@channel("orders.created")
interface OrderChannel {
  @kafkaOperation(#{ groupId: #{ type: "string" }, clientId: #{ type: "string" } })
  @receive
  op onOrderCreated(): OrderCreated;
}
```

```yaml
operations:
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/OrderChannel"
    bindings:
      kafka:
        groupId:
          type: string
        clientId:
          type: string
        bindingVersion: 0.5.0
```

## `@kafkaMessage`

```typespec
extern dec kafkaMessage(target: Model, config: valueof AsyncAPIKafkaMessageBinding);
```

| 欄位                      | 型別      | 必填 |
| ------------------------- | --------- | ---- |
| `key`                     | `unknown` | 否   |
| `schemaIdLocation`        | `string`  | 否   |
| `schemaIdPayloadEncoding` | `string`  | 否   |
| `schemaLookupStrategy`    | `string`  | 否   |

套用在帶有 `@message` 的 model 上。

`key` 是 Schema Object。寫法與 `groupId` 相同，用物件字面值。這裡不接受 TypeSpec 型別。emitter 也不檢查你寫的物件內容。

`schemaIdLocation` 是 `header` 或 `payload`。其他值由 `invalid-binding-field` 回報。

```typespec
@kafkaMessage(#{
  key: #{ type: "string" },
  schemaIdLocation: "payload",
  schemaIdPayloadEncoding: "apicurio-new",
  schemaLookupStrategy: "TopicIdStrategy"
})
@message
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
        kafka:
          key:
            type: string
          schemaIdLocation: payload
          schemaIdPayloadEncoding: apicurio-new
          schemaLookupStrategy: TopicIdStrategy
          bindingVersion: 0.5.0
```
