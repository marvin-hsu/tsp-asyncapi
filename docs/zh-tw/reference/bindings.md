# 通訊協定 binding

AsyncAPI 用 Bindings Object 描述特定通訊協定的設定。規格把它放在四種物件上：server、channel、operation 與 message。該物件的每一個成員各代表一個通訊協定，例如 `kafka`。

本 library 提供 Kafka 與 WebSocket binding 的 decorator。另外提供一個通用 decorator，供其他通訊協定使用。

一個通訊協定在一個物件上只佔一個成員。兩個 decorator 在同一個物件上宣告同一個成員是錯誤。emitter 不會合併兩份設定，後寫的那份也不會取代先寫的那份。

## `@binding`

```typespec
extern dec binding(target: unknown, protocol: valueof string, config: valueof unknown);
```

在 target 產生的物件上加入一個原樣的 binding。若某個通訊協定還沒有專屬 decorator，用這個。若某個欄位是新版 binding 才加入的，也用這個。

設定內容原樣輸出。這個 decorator 不加 `bindingVersion`。它不解讀設定的形狀，因此無法判斷欄位屬於哪一版。通訊協定需要該欄位時，自行寫進設定裡。

```typespec
@binding("mqtt", #{ qos: 2, retain: true })
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
      mqtt:
        qos: 2
        retain: true
```

target 是 `unknown`，因為四個位置都可能是目標。這個 decorator 不指定層級。binding 會落在 target 所產生的物件上。

::: warning
一個 namespace 可以同時是 service namespace 與 channel 的目標。此時 `@binding` 會同時進入 server 與 channel。若只想指定其中一個，改用專屬的 decorator。
:::

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

## `@websocketChannel`

```typespec
extern dec websocketChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIWebSocketChannelBinding
);
```

| 欄位      | 型別      | 必填 |
| --------- | --------- | ---- |
| `method`  | `string`  | 否   |
| `query`   | `unknown` | 否   |
| `headers` | `unknown` | 否   |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

輸出的成員名稱是 `ws`。AsyncAPI 的 binding 目錄叫 `websockets`，成員叫 `ws`。讀文件的人看到的是成員名稱。

`method` 是開啟連線的 HTTP method。AsyncAPI 只允許 `GET` 與 `POST`。其他值會透過 `invalid-binding-field` 回報。該欄位被丟棄，binding 的其餘部分保留。

`query` 與 `headers` 描述交握。兩者都是 Schema Object。寫成物件字面值，型別為 `object`，並帶 `properties` 鍵。這兩項都是 AsyncAPI 的規定。兩者皆不符的 schema 沒有描述任何參數，emitter 會回報並丟棄該欄位。`$ref` 不需要這兩個鍵，因為它指向的 schema 在別處。

WebSocket binding 沒有 server、operation 與 message 物件。規格明訂這三者不得帶任何屬性。所以 `@websocketChannel` 就是這個通訊協定的全部。

```typespec
@websocketChannel(#{
  method: "GET",
  query: #{ type: "object", properties: #{ token: #{ type: "string" } } }
})
@channel("/ticks")
interface TickStream {
  @send
  op publish(event: Tick): void;
}
```

```yaml
channels:
  TickStream:
    address: /ticks
    bindings:
      ws:
        method: GET
        query:
          type: object
          properties:
            token:
              type: string
        bindingVersion: 0.1.0
```

## 跨物件的規則

::: warning
有四個 Kafka 欄位需要 schema registry。registry 的網址在 server binding 上。Kafka binding 規格說明，沒有 server 層級的 `schemaRegistryUrl` 時，不得使用下列欄位：

- `schemaRegistryVendor`，在 server binding 上
- `schemaIdLocation`，在 message binding 上
- `schemaIdPayloadEncoding`，在 message binding 上
- `schemaLookupStrategy`，在 message binding 上

emitter 不檢查這些規則。每一條都橫跨文件的兩個物件。使用上述任一欄位時，請在 service namespace 上設定 `schemaRegistryUrl`。
:::

## binding 版本

每個具名 binding 都帶有它所依循的規格版本。Kafka binding 帶 `bindingVersion: 0.5.0`，WebSocket binding 帶 `bindingVersion: 0.1.0`。emitter 一律寫入這個欄位，也無法透過 decorator 更改。

AsyncAPI 規定，欄位不存在時讀取端必須當成 `latest`。`latest` 的內容會隨時間改變，所以版本一律寫出。

`@binding` 完全不寫版本。需要版本時，自行加進設定裡。

## 診斷訊息

| 代碼                       | 嚴重度  | 情境                                                 |
| -------------------------- | ------- | ---------------------------------------------------- |
| `duplicate-binding`        | error   | 同一個 target 的同一層級上，一個通訊協定被宣告兩次。 |
| `empty-binding-protocol`   | error   | `@binding` 的通訊協定名稱是空白。                    |
| `invalid-binding-config`   | error   | `@binding` 的設定不是物件。                          |
| `invalid-binding-field`    | warning | 某個 binding 欄位的值違反規格。                      |
| `binding-outside-document` | warning | binding 所在的 target 不會產生對應的物件。           |

`invalid-binding-field` 是 warning，因為 emitter 只丟掉那一個欄位。binding 的其餘欄位保留，文件也照常產出。上面四個代碼是 error，因為它們各自丟掉整個 binding。

完整清單見[診斷訊息](/zh-tw/reference/diagnostics)。
