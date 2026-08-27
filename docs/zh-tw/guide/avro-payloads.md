---
title: "Avro payload"
description: "帶有 tsp-avro decorator 的 model，可以用 Avro schema 當作 AsyncAPI payload。本頁說明如何開啟，以及會寫出什麼。"
---

# Avro payload

這個功能透過 [`tsp-avro`](./avro-schemas) 達成。

::: warning
這是預覽功能，預設關閉。開啟它的選項、寫出的 schema，以及回報的診斷，都可能在次版本變更。

`tsp-avro` 同樣是實驗性套件。它尚未進入 1.0，decorator 與輸出都可能在任何一次發佈中改變。
:::

## 使用方式

先在本 emitter 旁邊安裝 Avro 套件。

```bash
pnpm add "tsp-avro@0.2.x"
```

目前支援的版本是 `0.2.x`。`tsp-avro` 尚未進入 1.0，decorator 仍可能變動，支援範圍會隨它發佈更新。

再於 `tspconfig.yaml` 啟用 `avro` 預覽功能。

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["avro"]
```

## 範例

以下範例來自 [`examples/18-avro-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/18-avro-payloads)。它有一個 Avro namespace、兩個 record，以及一個帶 schema registry 的 Kafka 叢集。以下只節錄幾個片段。

`@Avro.avroNamespace` 標記一個 namespace，底下每一個 Avro 名稱都由它限定。

```typespec
@Avro.avroNamespace("com.example.orders")
namespace Orders {
```

```typespec
  /**
   * One order a customer placed.
   */
  @message
  @contentType("application/vnd.apache.avro")
  @headers(EventHeaders)
  @Avro.avroRecord
  @kafkaMessage(#{ schemaIdLocation: "payload", schemaLookupStrategy: "TopicIdStrategy" })
  // An example carries the headers as well as the payload. The two halves are
  // written in different schema languages, so an example shows a reader what
  // each of them looks like on its own terms. A logical type is written as
  // what is on the wire: a `uuid` is the text of the UUID, and a
  // `timestamp-millis` is the millisecond count.
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "checkout" },
      payload: #{
        id: "6b1f7c2e-6f3a-4f52-9c1c-0f0b6a1d3f10",
        placedAt: 1755993600000,
        shipping: #{ line1: "12 Zhongxiao E Rd", city: "Taipei", country: "TW" },
        totalMinorUnits: 249000,
      },
    },
    #{ name: "typical-order", summary: "One order, paid in TWD." }
  )
  model OrderPlaced {
    // `uuid` is written on a string, so what is on the wire is the text of
    // the UUID.
    /** The identifier of the order. */
    @Avro.logicalType("uuid")
    id: string;

    /** When the customer placed the order. */
    placedAt: Timestamp;

    /** Where the order goes. */
    shipping: Address;

    /** What the order came to, in the smallest unit of its currency. */
    totalMinorUnits: int64;
  }
```

```typespec
@kafkaChannel(#{ topic: "orders.placed", partitions: 12, replicas: 3 })
@channel("orders.placed")
interface Placed {
  @send
  op placed(event: Orders.OrderPlaced): void;
}

// The retry topic carries the same message as the main one. One model is one
// message of the document, so both channels point at one entry under
// `components.messages` rather than at two copies of it.
@kafkaChannel(#{ topic: "orders.placed.retry", partitions: 3, replicas: 3 })
@channel("orders.placed.retry")
interface PlacedRetry {
  @send
  op retried(event: Orders.OrderPlaced): void;
}
```

兩個 channel 都帶 `OrderPlaced`。一個 model 在文件裡就是一個 message，所以兩個 channel 指向 `components.messages` 裡的同一筆。

## 結果

payload 是一個 [Multi Format Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#multiFormatSchemaObject)。`schemaFormat` 指名 Avro 1.9.0，`schema` 帶著 schema 本身。

schema 是物件，不是字串。Avro 本身就是 JSON，而 AsyncAPI 對 JSON 類的格式採內嵌，不用文字承載。以下是範例裡的 `OrderPlaced` message，內容取自 `asyncapi.yaml`：

```yaml
components:
  schemas:
    Orders.EventHeaders:
      type: object
      properties:
        x-correlation-id:
          type: string
          description: Ties every message of one request together.
        x-source:
          type: string
          description: The application that published the message.
      required:
        - x-correlation-id
        - x-source
      description: What every message of this application carries beside its payload.
  messages:
    OrderPlaced:
      name: OrderPlaced
      description: One order a customer placed.
      contentType: application/vnd.apache.avro
      headers:
        $ref: "#/components/schemas/Orders.EventHeaders"
      payload:
        schemaFormat: application/vnd.apache.avro;version=1.9.0
        schema:
          type: record
          name: OrderPlaced
          namespace: com.example.orders
          doc: One order a customer placed.
          fields:
            - name: id
              type:
                type: string
                logicalType: uuid
              doc: The identifier of the order.
            - name: placedAt
              type:
                type: long
                logicalType: timestamp-millis
              doc: When the customer placed the order.
            - name: shipping
              type:
                type: record
                name: Address
                namespace: com.example.orders
                doc: Where an order goes.
                fields:
                  - name: line1
                    type: string
                    doc: The street and the number.
                  - name: city
                    type: string
                  - name: country
                    type: string
                    doc: The ISO 3166-1 alpha-2 code of the country.
              doc: Where the order goes.
            - name: totalMinorUnits
              type: long
              doc: What the order came to, in the smallest unit of its currency.
      bindings:
        $ref: "#/components/messageBindings/OrderPlaced"
```

每一份 payload 帶一個 Avro record，以及那個 record 觸及的每一個具名型別。Avro 沒有 import，所以一份 schema 要嘛自成一體，要嘛讀取端建不起來。

兩個 record 都觸及 `Address`，所以兩份 payload 各帶一份完整的它。`Address` 不是文件的 message，所以它沒有自己的 payload。具名型別在第一次出現時完整寫出，之後只寫名稱。遞迴觸及自己的 record 也是靠這一點收斂。

## `.avsc` 檔案

如果希望同時輸出 `.avsc` 檔案，在 `tspconfig.yaml` 的 `emit` 加上 Avro emitter。

```yaml
emit:
  - "tsp-asyncapi"
  - "tsp-avro"

options:
  "tsp-asyncapi":
    preview-features: ["avro"]
  "tsp-avro":
    emitter-output-dir: "{project-root}/schemas"
```

Avro emitter 每個 record 寫一個檔案。路徑由 Avro namespace 決定，所以這個範例寫出 `schemas/com/example/orders/OrderPlaced.avsc` 與 `schemas/com/example/orders/OrderCancelled.avsc`。前者的內容：

```json
{
  "type": "record",
  "name": "OrderPlaced",
  "namespace": "com.example.orders",
  "doc": "One order a customer placed.",
  "fields": [
    {
      "name": "id",
      "type": {
        "type": "string",
        "logicalType": "uuid"
      },
      "doc": "The identifier of the order."
    },
    {
      "name": "placedAt",
      "type": {
        "type": "long",
        "logicalType": "timestamp-millis"
      },
      "doc": "When the customer placed the order."
    },
    {
      "name": "shipping",
      "type": {
        "type": "record",
        "name": "Address",
        "namespace": "com.example.orders",
        "doc": "Where an order goes.",
        "fields": [
          {
            "name": "line1",
            "type": "string",
            "doc": "The street and the number."
          },
          {
            "name": "city",
            "type": "string"
          },
          {
            "name": "country",
            "type": "string",
            "doc": "The ISO 3166-1 alpha-2 code of the country."
          }
        ]
      },
      "doc": "Where the order goes."
    },
    {
      "name": "totalMinorUnits",
      "type": "long",
      "doc": "What the order came to, in the smallest unit of its currency."
    }
  ]
}
```

## header

帶 `@Avro.avroRecord` 的 model，不可以在自己的屬性上標 `@header`。標了會回報 [`header-on-generated-payload`](../reference/diagnostics#header-on-generated-payload)，而且不會寫出任何檔案。

要描述 header，改用 [`@headers`](../reference/decorators/messages#headers) 指向另一個 model。

## `@rawPayload`

[`@rawPayload`](../reference/decorators/messages#rawpayload) 用來手寫其他語言的 schema，優先於產生的 schema。

同時帶兩者的 model 會回報 [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source)。文件保留作者手寫的 schema。要改用產生的 schema，就從該 model 移除 `@rawPayload`。
