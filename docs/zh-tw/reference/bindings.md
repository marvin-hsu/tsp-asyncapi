# 通訊協定 binding

AsyncAPI 用 Bindings Object 描述特定通訊協定的設定。規格把它放在四種物件上：server、channel、operation 與 message。該物件的每一個成員各代表一個通訊協定，例如 `kafka`。

本 library 為十二個通訊協定提供 decorator：Kafka、WebSocket、MQTT、HTTP、AMQP、NATS、Pulsar、Google Cloud Pub/Sub、Amazon SQS、Anypoint MQ、JMS、IBM MQ 與 Solace。另外提供一個通用 decorator，供其他通訊協定使用。

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

## `@httpOperation`

```typespec
extern dec httpOperation(target: Operation, config: valueof AsyncAPIHttpOperationBinding);
```

| 欄位     | 型別      | 必填 |
| -------- | --------- | ---- |
| `method` | `string`  | 否   |
| `query`  | `unknown` | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`method` 是 `GET`、`PUT`、`POST`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`、`CONNECT`、`TRACE` 其中之一。

`query` 是型別為 `object` 且帶 `properties` 鍵的 Schema Object。這兩項都是 AsyncAPI 的規定。

## `@httpMessage`

```typespec
extern dec httpMessage(target: Model, config: valueof AsyncAPIHttpMessageBinding);
```

| 欄位         | 型別      | 必填 |
| ------------ | --------- | ---- |
| `headers`    | `unknown` | 否   |
| `statusCode` | `int32`   | 否   |

套用在同時帶有 `@message` 的 model 上。

`headers` 是型別為 `object` 且帶 `properties` 鍵的 Schema Object。

`statusCode` 是 RFC 9110 的狀態碼，範圍在 100 到 599 之間。AsyncAPI 規定它只適用於被 Operation Reply Object 指名的 message。emitter 不檢查這條規則，因為它跨兩個物件。

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

## `@natsOperation`

```typespec
extern dec natsOperation(target: Operation, config: valueof AsyncAPINatsOperationBinding);
```

| 欄位    | 型別     | 必填 |
| ------- | -------- | ---- |
| `queue` | `string` | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`queue` 是訂閱加入的 queue group 名稱。NATS 把每則訊息送給 queue group 裡的一位成員，而不是全部成員。名稱最長 255 個字元。

NATS 沒有定義 server、channel 或 message binding。

## `@pulsarServer`

```typespec
extern dec pulsarServer(target: Namespace, config: valueof AsyncAPIPulsarServerBinding);
```

| 欄位     | 型別     | 必填 |
| -------- | -------- | ---- |
| `tenant` | `string` | 否   |

套用在服務 namespace 上。topic 的位址是 `<tenant>/<namespace>/<topic>`，所以這個欄位和 channel 的 `namespace` 是同一個位址的兩個部分。

## `@pulsarChannel`

```typespec
extern dec pulsarChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIPulsarChannelBinding
);
```

| 欄位             | 型別                      | 必填   |
| ---------------- | ------------------------- | ------ |
| `namespace`      | `string`                  | **是** |
| `persistence`    | `string`                  | **是** |
| `compaction`     | `int32`                   | 否     |
| `geoReplication` | `string[]`                | 否     |
| `retention`      | `AsyncAPIPulsarRetention` | 否     |
| `ttl`            | `int32`                   | 否     |
| `deduplication`  | `boolean`                 | 否     |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

::: warning
`namespace` 是 TypeSpec 的保留字。欄位名稱要用反引號寫成 `` `namespace`: "orders" ``。輸出的欄位仍然是 `namespace`。
:::

`namespace` 與 `persistence` 是必填。缺任一個時，binding 會透過 `missing-binding-field` 回報並整個丟棄。`persistence` 是 `persistent` 或 `non-persistent`。

`geoReplication` 用這個名稱，是因為 TypeSpec 的欄位名稱不能帶連字號。輸出的欄位是 `geo-replication`。

`retention.time` 與 `retention.size` 是零或以上。零表示關閉該項保留。

## `@googlePubSubChannel`

```typespec
extern dec googlePubSubChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIGooglePubSubChannelBinding
);
```

| 欄位                       | 型別                                 | 必填   |
| -------------------------- | ------------------------------------ | ------ |
| `schemaSettings`           | `AsyncAPIGooglePubSubSchemaSettings` | **是** |
| `labels`                   | `Record<unknown>`                    | 否     |
| `messageRetentionDuration` | `string`                             | 否     |
| `messageStoragePolicy`     | `AsyncAPIGooglePubSubStoragePolicy`  | 否     |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

`schemaSettings` 是必填，它自己又要求 `encoding` 與 `name`。缺這些時，binding 會透過 `missing-binding-field` 回報並整個丟棄。

`labels` 是開放的 map。Pub/Sub 對它的鍵與值都沒有規定，所以原樣輸出。

## `@googlePubSubMessage`

```typespec
extern dec googlePubSubMessage(
  target: Model,
  config: valueof AsyncAPIGooglePubSubMessageBinding
);
```

| 欄位          | 型別                         | 必填 |
| ------------- | ---------------------------- | ---- |
| `attributes`  | `Record<unknown>`            | 否   |
| `orderingKey` | `string`                     | 否   |
| `schema`      | `AsyncAPIGooglePubSubSchema` | 否   |

套用在同時帶有 `@message` 的 model 上。沒有必填欄位。

`schema` 是選填，但寫了 `schema` 卻沒寫 `name` 等於沒指名任何 schema，所以會被回報並丟棄。

## `@sqsChannel`

```typespec
extern dec sqsChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPISqsChannelBinding
);
```

| 欄位              | 型別               | 必填   |
| ----------------- | ------------------ | ------ |
| `queue`           | `AsyncAPISqsQueue` | **是** |
| `deadLetterQueue` | `AsyncAPISqsQueue` | 否     |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

`queue` 是必填，在這一層它自己又要求 `name` 與 `fifoQueue`。缺這些時，binding 會透過 `missing-binding-field` 回報並整個丟棄。

`deadLetterQueue` 是選填，形狀相同。寫了但不完整時會被回報並丟棄，binding 的其餘部分保留。

`deduplicationScope` 是 `queue` 或 `messageGroup`。`fifoThroughputLimit` 是 `perQueue` 或 `perMessageGroupId`。四個時間欄位都是秒數，不會是負數。

## `@sqsOperation`

```typespec
extern dec sqsOperation(target: Operation, config: valueof AsyncAPISqsOperationBinding);
```

| 欄位     | 型別                 | 必填   |
| -------- | -------------------- | ------ |
| `queues` | `AsyncAPISqsQueue[]` | **是** |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`queues` 是必填，每一筆都要求 `name`。缺 `name` 的那一筆會被回報並丟棄。整份清單一筆不剩時，會回報成缺少 `queues`，因為空清單沒有指名任何 queue。

這一層的 queue 只要求 `name`。channel binding 還要求 `fifoQueue`，這是 AsyncAPI 對兩層所訂的差異。

## `@anypointMqChannel`

```typespec
extern dec anypointMqChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIAnypointMqChannelBinding
);
```

| 欄位              | 型別     | 必填 |
| ----------------- | -------- | ---- |
| `destination`     | `string` | 否   |
| `destinationType` | `string` | 否   |

`destinationType` 是 `exchange`、`queue` 或 `fifo-queue`。

## `@anypointMqMessage`

```typespec
extern dec anypointMqMessage(
  target: Model,
  config: valueof AsyncAPIAnypointMqMessageBinding
);
```

| 欄位      | 型別      | 必填 |
| --------- | --------- | ---- |
| `headers` | `unknown` | 否   |

`headers` 是 Schema Object。Anypoint MQ 對它的形狀沒有規定，這一點和 HTTP 與 WebSocket binding 不同。

## `@jmsServer`

```typespec
extern dec jmsServer(target: Namespace, config: valueof AsyncAPIJmsServerBinding);
```

| 欄位                   | 型別        | 必填   |
| ---------------------- | ----------- | ------ |
| `jmsConnectionFactory` | `string`    | **是** |
| `properties`           | `unknown[]` | 否     |
| `clientID`             | `string`    | 否     |

套用在服務 namespace 上。

`jmsConnectionFactory` 是必填。缺它時，binding 會透過 `missing-binding-field` 回報並整個丟棄。

## `@jmsChannel`

```typespec
extern dec jmsChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIJmsChannelBinding
);
```

| 欄位              | 型別     | 必填 |
| ----------------- | -------- | ---- |
| `destination`     | `string` | 否   |
| `destinationType` | `string` | 否   |

`destinationType` 是 `queue` 或 `fifo-queue`。JMS 沒有列 `exchange`，這一點和 Anypoint MQ 不同。

## `@jmsMessage`

```typespec
extern dec jmsMessage(target: Model, config: valueof AsyncAPIJmsMessageBinding);
```

| 欄位      | 型別      | 必填 |
| --------- | --------- | ---- |
| `headers` | `unknown` | 否   |

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

`headers` 是以逗號分隔的標頭名稱清單，不是 Schema Object。IBM MQ 是本 library 裡唯一這樣定義該欄位的 binding。

## `@solaceServer`

```typespec
extern dec solaceServer(target: Namespace, config: valueof AsyncAPISolaceServerBinding);
```

| 欄位         | 型別     | 必填 |
| ------------ | -------- | ---- |
| `msgVpn`     | `string` | 否   |
| `clientName` | `string` | 否   |

套用在服務 namespace 上。`clientName` 最長 160 個字元。

輸出的欄位是 `msgVpn`。Solace binding 的 0.2.0 版把它拼成 `msvVpn`，本 library 輸出 0.4.0 版。

## `@solaceOperation`

```typespec
extern dec solaceOperation(target: Operation, config: valueof AsyncAPISolaceOperationBinding);
```

| 欄位           | 型別        | 必填 |
| -------------- | ----------- | ---- |
| `destinations` | `unknown[]` | 否   |
| `timeToLive`   | `int32`     | 否   |
| `priority`     | `int32`     | 否   |
| `dmqEligible`  | `boolean`   | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`destinations` 的每一筆可以帶 `deliveryMode`，值為 `direct` 或 `persistent`。其他值會被回報並從該筆丟棄，該筆的其餘欄位保留。一筆的其餘欄位原樣輸出。

`priority` 是零或以上。

## 沒有具名 decorator 的通訊協定

AsyncAPI 另外保留五個成員名稱。本 library 不為它們提供 decorator，理由有兩個。

`amqp1`、`redis` 與 `stomp` 會被 AsyncAPI parser 接受，而三者都沒有任何欄位。具名 decorator 沒有東西可以驗證，也沒有版本可以寫，所以 `@binding("redis", #{})` 已經說完它們能說的全部。

`mercure`、`mqtt5` 與 `ros2` 在 AsyncAPI 3.0 文件的四個層級都會被 AsyncAPI parser 拒絕。帶有這些成員的文件無法通過驗證，所以本 library 既不提供 decorator，也不建議用通用機制產生它們。

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

每個具名 binding 都帶有它所依循的規格版本。emitter 一律寫入這個欄位，也無法透過 decorator 更改。

| 通訊協定             | 成員           | 版本  |
| -------------------- | -------------- | ----- |
| Kafka                | `kafka`        | 0.5.0 |
| WebSocket            | `ws`           | 0.1.0 |
| MQTT                 | `mqtt`         | 0.2.0 |
| HTTP                 | `http`         | 0.3.0 |
| AMQP                 | `amqp`         | 0.3.0 |
| NATS                 | `nats`         | 0.1.0 |
| Pulsar               | `pulsar`       | 0.1.0 |
| Google Cloud Pub/Sub | `googlepubsub` | 0.2.0 |
| Amazon SQS           | `sqs`          | 0.2.0 |
| Anypoint MQ          | `anypointmq`   | 0.0.1 |
| JMS                  | `jms`          | 0.0.1 |
| IBM MQ               | `ibmmq`        | 0.1.0 |
| Solace               | `solace`       | 0.4.0 |

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
| `missing-binding-field`    | error   | binding 沒有給規格要求的欄位。                       |

`invalid-binding-field` 是 warning，因為 emitter 只丟掉那一個欄位。binding 的其餘欄位保留，文件也照常產出。其餘代碼是 error，因為它們各自丟掉整個 binding。缺少必填欄位的 binding 無法寫成合法文件，作者也就沒有任何殘留可以檢查。

完整清單見[診斷訊息](/zh-tw/reference/diagnostics)。
