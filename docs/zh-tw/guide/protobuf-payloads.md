---
title: "Protobuf payload"
description: "帶有官方 TypeSpec.Protobuf decorator 的 model，可以用 proto3 文字當作 AsyncAPI payload。本頁說明如何開啟，以及會寫出什麼。"
---

# Protobuf payload

帶有官方 `TypeSpec.Protobuf` decorator 的 model，可以用 proto3 文字當作 AsyncAPI payload。本頁說明如何開啟，以及會寫出什麼。

::: warning
這是預覽功能，預設關閉。開啟它的選項、寫出的 schema，以及回報的診斷，都可能在次版本變更。
:::

## 這個功能做什麼

[`@typespec/protobuf`](https://www.npmjs.com/package/@typespec/protobuf) 把 model 描述成 Protobuf message。它自己的 emitter 會把 model 寫成 `.proto` 檔案。

本 emitter 讀取同一批 decorator，自己寫出 proto3 文字，放進 AsyncAPI message 的 payload。所以資料只描述一次，文件與 `.proto` 檔案描述同一種傳輸格式。

沒開這個功能時，官方 decorator 在這裡不造成任何差異。那些 model 會和其他 model 一樣轉成 JSON Schema。

## 開啟方式

先在本 emitter 旁邊安裝官方套件。

```bash
npm install "@typespec/protobuf@0.85.x"
```

本版支援該套件的 `0.85.x` 範圍。本 emitter 讀取這個範圍寫下的 decorator state。其他範圍可能寫出本 emitter 不讀的 state，那時就取不到 payload。

再於 `tspconfig.yaml` 指名這個功能。

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["protobuf"]
```

[`preview-features`](../reference/emitter-options#預覽功能) 的保留名稱是 `protobuf` 與 `avro`。本版兩個都可以使用。另一個見 [Avro payload 指南](./avro-payloads)。

## 撰寫來源

下面這份是 repository 裡的 [`examples/16-protobuf-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/16-protobuf-payloads)。它有兩個 Protobuf package、三個帶範例的 message，以及一個掛 AMQP binding 的 RabbitMQ broker。下面節錄 orders package 與一個 channel。完整檔案在 repository 裡。

header 走在 payload 旁邊，所以它不是 proto message 的一部分。Protobuf 沒有任何欄位編號的意思是「這一個在別的地方」，所以 `@Protobuf.message` 的 model 帶 `@header` 是錯誤。headers 改用自己的 model，兩個 package 指向同一個。

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

作用域裡有兩個叫 `message` 的 decorator。`@message` 是 AsyncAPI 的，把 model 標記成文件的一個 message。`@Protobuf.message` 把同一個 model 標記成 `.proto` 檔案的一個 message。Protobuf 那個要寫完整名稱。

`@Protobuf.package` 標記哪一個 namespace 會變成一個 `.proto` 檔案。裡面的名稱是該檔案的 `package` 宣告，與 TypeSpec namespace 的名稱無關。

## emitter 寫出什麼

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

payload 的 message 就是文字裡沒有被任何宣告引用的那一個。Protobuf 讀取工具靠這一點找到根。其他每一個宣告都是被引用才進來的。

兩個互相引用的 model 沒有這樣的宣告。兩者都被對方引用，所以帶著這一對的 payload 沒有根。那份文字仍然是正確的 proto3，本 emitter 也會寫出它。官方的 AsyncAPI Protobuf schema parser 會拒絕它，因為那個 parser 用「沒有被引用的宣告」找根。

因此同一個 package 的兩個 model 是兩份 payload。兩者的傳輸格式不同。共用一份 schema 等於宣稱一個型別可以解碼兩者。

## 運作方式

compiler 執行官方 decorator，每一個都會記下拿到的內容。`@Protobuf.package` 在 namespace 上記下 package 名稱。`@Protobuf.message` 記下某個 model 是 Protobuf message。`@Protobuf.field` 記下屬性的編號。`@Protobuf.reserve` 記下 message 保留了什麼。

本 emitter 讀取這些記錄。對一個 message model，它先往上找最近一個帶 `@Protobuf.package` 的 namespace。接著走訪該 model 的欄位。scalar 欄位對應成 proto3 scalar。型別是具名 model 或 enum 的欄位會把該宣告收進來，走訪也繼續進入它。已經在文字裡的宣告不會再走一次，所以引用到自己的 model 會停下來。

走完的結果是一個 message 的閉包。printer 依走訪順序把它寫成 proto3 文字。欄位順序就是 model 宣告屬性的順序。所以同一份來源每次都渲染出同一份文字。

本 emitter 在執行期不 import `@typespec/protobuf`。compiler 用套件名稱組出 state 的鍵，所以光憑名稱就讀得到那些記錄。官方套件是撰寫 decorator 的專案的相依，不是本 emitter 的相依。

這些 decorator 的語意以官方 emitter 為準。測試會把同一份來源編譯兩次。一次由本 emitter 渲染 payload。另一次執行官方 emitter，讀它寫出的 `.proto` 檔案。兩份文字都解析成 descriptor 後比對。型別、欄位編號、label 與名稱必須相同。註解與排版不列入比對，因為描述同一種傳輸格式的兩份文字，對文件的每一個使用者都是等價的。

## 同時寫出 `.proto` 檔案

兩個 emitter 各自獨立。專案若也需要磁碟上的檔案，在 `emit` 同時列出兩個。

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

本 emitter 不讀那個檔案，也不執行官方 emitter。兩者讀同一批 decorator，各自寫出自己的文字。所以不論檔案有沒有寫出，payload 都一樣。

兩份文字的排版不同。上面的檔案帶著該 package 的每一個 message，順序是來源宣告的順序。payload 只帶一個 message 與它的閉包，而且該 message 排在最前面。兩者描述同一種傳輸格式。

## headers 不會進 payload

Protobuf 沒有辦法描述一個 payload 不帶的屬性。proto message 的每個屬性都要有欄位編號，而沒有任何編號的意思是「這一個走在別的地方」。

所以帶著 `@Protobuf.message` 的 model，不可以在自己的欄位上標 `@header`。標了會回報 [`header-on-generated-payload`](../reference/diagnostics#header-on-generated-payload)，而且不會寫出任何檔案。不論那個屬性有沒有 `@Protobuf.field`，也不論預覽功能有沒有開啟，都是如此。

改用 [`@headers`](../reference/decorators/messages#headers)。一個獨立的 model 裝 headers，message model 裝 payload，這樣 proto message 與 `.proto` 檔案描述同一組欄位。

headers 由它的 TypeSpec model 降級而來，所以在 payload 是 proto3 的時候，headers 是 JSON Schema。Multi Format Schema Object 允許兩個 slot 用不同格式，這就是它合法的原因。

headers 永遠不會是 Protobuf，而這不是預覽功能的限制。header 以自己的 key 與 value 傳送，沒有任何傳輸層把整個 headers 物件當成一塊編碼過的資料。

## Protobuf 沒有描述的部分

Protobuf 描述資料。它沒有描述 message 走哪一個 channel、message 的方向，也沒有描述應用的 operation。

所以 `@channel`、`@send`、`@receive` 與 `@message` 仍然必要。只帶 `@Protobuf.message` 而沒有 `@AsyncAPI.message` 的 model 不會拿到 payload，也不會回報任何診斷。

## 作者手寫的 payload

[`@rawPayload`](../reference/decorators/messages#rawpayload) 用來手寫其他語言的 schema。那是作者的明示宣告，所以優先於產生的 schema。

同時帶兩者的 model 會回報 [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source)。文件保留作者手寫的 schema。要改用產生的 schema，就從該 model 移除 `@rawPayload`。

## 取不到文字的情況

產生的 payload 有可能不存在，原因有三種。model 上方可能沒有 `@Protobuf.package`。走訪可能碰到本 emitter 寫不成 proto3 的構造。欄位可能用到對應不到 proto3 型別的 scalar。

以上每一種都會回報 [`protobuf-artifact-unavailable`](../reference/diagnostics#protobuf-artifact-unavailable)，訊息會說明是哪一種。參考頁列出走訪拒絕的每一種構造。

emitter 選擇回報問題，而不是寫出空的 payload。空的 payload 讀起來像是什麼都沒描述的 schema。文件也不會寫出，因為退回 JSON Schema 的文件等於在沒有說明的情況下回應了 proto3 的請求。
