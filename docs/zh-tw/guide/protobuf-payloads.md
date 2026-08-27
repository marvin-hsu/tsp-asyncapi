---
title: "Protobuf payload"
description: "帶有官方 TypeSpec.Protobuf decorator 的 model，可以用 proto3 文字當作 AsyncAPI payload。本頁說明如何開啟，以及會寫出什麼。"
---

# Protobuf payload

tsp-asyncapi 原生支援 [`@typespec/protobuf`](https://www.npmjs.com/package/@typespec/protobuf) 提供的 decorator。

::: warning
這是預覽功能，預設關閉。開啟它的選項、寫出的 schema，以及回報的診斷，都可能在次版本變更。
:::

## 使用方式

先在本 emitter 旁邊安裝官方套件。

```bash
pnpm add "@typespec/protobuf@0.85.x"
```

目前支援的版本是 `0.85.x`。`@typespec/protobuf` 尚未進入 1.0，decorator 仍可能變動，支援範圍會隨官方發佈更新。

再於 `tspconfig.yaml` 啟用 `protobuf` 預覽功能。

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["protobuf"]
```

## 範例

下面這份是 repository 裡的 [`examples/16-protobuf-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/16-protobuf-payloads)。它有兩個 Protobuf package、三個帶範例的 message，以及一個掛 AMQP binding 的 RabbitMQ broker。下面節錄 orders package 與一個 channel。完整檔案在 repository 裡。

```typespec
/** What every message of this application carries beside its payload. */
model EventHeaders {
  /** Ties every message of one request together. */
  `x-correlation-id`: string;

  /** The application that published the message. */
  `x-source`: string;
}
```

```typespec
@Protobuf.package({ name: "com.example.orders" })
namespace Orders {
  /**
   * An amount of money, as the smallest unit of one currency.
   */
  // No `@AsyncAPI.message` here: this model is not a message of the
  // document. It still reaches the emitted payloads, because `OrderPlaced`
  // names it in a field, and a payload carries every declaration its
  // message reaches.
  @Protobuf.message
  model Money {
    @Protobuf.field(1)
    currency: string;

    @Protobuf.field(2)
    amount: int64;
  }

  /**
   * One order a customer placed.
   */
  // Two decorators named `message` are in scope. The AsyncAPI one marks a
  // model as a message of the document. The Protobuf one marks it as a
  // message of the `.proto` file. The Protobuf one is written qualified.
  @message
  @headers(EventHeaders)
  @Protobuf.message
  // An example carries the headers as well as the payload. The headers are
  // JSON Schema and the payload is proto3, so an example shows a reader what
  // each half looks like on its own terms.
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "checkout" },
      payload: #{ orderId: "ord-1001", total: #{ currency: "TWD", amount: 249000 } },
    },
    #{ name: "typical-order", summary: "One order, paid in TWD." }
  )
  model OrderPlaced {
    @Protobuf.field(1)
    orderId: string;

    @Protobuf.field(2)
    total: Money;
  }
}

// The channel is a topic exchange, said with an AMQP channel binding.
@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "orders", type: "topic", durable: true, vhost: "/orders" },
})
@channel("order.placed")
interface Placed {
  // Persistent delivery, said with an AMQP operation binding. `deliveryMode`
  // is 1 for transient and 2 for persistent.
  @amqpOperation(#{ deliveryMode: 2, mandatory: true, timestamp: true })
  @send
  op placed(event: Orders.OrderPlaced): void;
}
```

## 結果

payload 是 [Multi Format Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#multiFormatSchemaObject)。`schemaFormat` 指名 proto3，`schema` 放文字內容。

下面是範例裡的 `OrderPlaced`，內容取自 `asyncapi.yaml`。

```yaml
components:
  schemas:
    EventHeaders:
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
      headers:
        $ref: "#/components/schemas/EventHeaders"
      payload:
        schemaFormat: application/vnd.google.protobuf;version=3
        schema: |
          syntax = "proto3";

          package com.example.orders;

          // One order a customer placed.
          message OrderPlaced {
            string orderId = 1;
            Money total = 2;
          }

          // An amount of money, as the smallest unit of one currency.
          message Money {
            string currency = 1;
            int64 amount = 2;
          }
      examples:
        - name: typical-order
          summary: One order, paid in TWD.
          headers:
            x-correlation-id: req-8f21
            x-source: checkout
          payload:
            orderId: ord-1001
            total:
              currency: TWD
              amount: 249000
```

每份 payload 是一段能獨立成立的 proto3 文字。它帶著 `syntax` 那一行、`package` 那一行、自己的 message，以及該 message 經由欄位所及的每一個宣告。message 所不及的宣告不會進入 payload。所以一份 payload 只描述一個 message。

`OrderPlaced` 的欄位引用 `Money`，所以它的 payload 帶著兩個宣告。`OrderShipped` 什麼都沒引用，payload 只有自己。`Money` 不是文件的 message，所以它自己沒有 payload。

## `.proto` 檔案

如果希望同時輸出 `.proto` 定義檔，在 `tspconfig.yaml` 的 `emit` 加上官方 emitter。

```yaml
emit:
  - "tsp-asyncapi"
  - "@typespec/protobuf"

options:
  "tsp-asyncapi":
    preview-features: ["protobuf"]
  "@typespec/protobuf":
    emitter-output-dir: "{project-root}/proto"
```

官方 emitter 每個 package 寫一個檔案：`proto/com/example/orders.proto` 與 `proto/com/example/billing.proto`。orders 那份如下。

```proto
// Generated by Microsoft TypeSpec

syntax = "proto3";

package com.example.orders;

// An amount of money, as the smallest unit of one currency.
message Money {
  string currency = 1;
  int64 amount = 2;
}

// One order a customer placed.
message OrderPlaced {
  string orderId = 1;
  Money total = 2;
}

// One order that left the warehouse.
message OrderShipped {
  string orderId = 1;
  string carrier = 2;
}
```

## header

帶 `@Protobuf.message` 的 model，不可以在自己的屬性上標 `@header`。標了會回報 [`header-on-generated-payload`](../reference/diagnostics#header-on-generated-payload)，而且不會寫出任何檔案。

要描述 header，改用 [`@headers`](../reference/decorators/messages#headers) 指向另一個 model。

## `@rawPayload`

[`@rawPayload`](../reference/decorators/messages#rawpayload) 用來手寫其他語言的 schema，優先於產生的 schema。

同時帶兩者的 model 會回報 [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source)。文件保留作者手寫的 schema。要改用產生的 schema，就從該 model 移除 `@rawPayload`。

## 取不到文字的情況

產生的 payload 有可能不存在，原因有三種。model 上方可能沒有 `@Protobuf.package`。走訪可能碰到本 emitter 寫不成 proto3 的構造。欄位可能用到對應不到 proto3 型別的 scalar。

以上每一種都會回報 [`protobuf-artifact-unavailable`](../reference/diagnostics#protobuf-artifact-unavailable)，訊息會說明是哪一種。參考頁列出走訪拒絕的每一種構造。
