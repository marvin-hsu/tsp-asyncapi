---
title: "Avro payload"
description: "帶有 tsp-avro decorator 的 model，可以用 Avro schema 當作 AsyncAPI payload。本頁說明如何開啟，以及會寫出什麼。"
---

# Avro payload

帶有 `tsp-avro` decorator 的 model，可以用 Avro schema 當作 AsyncAPI payload。本頁說明如何開啟，以及會寫出什麼。

::: warning
這是預覽功能，預設關閉。開啟它的選項、寫出的 schema，以及回報的診斷，都可能在次版本變更。

`tsp-avro` 同樣是實驗性套件。它尚未進入 1.0，decorator 與輸出都可能在任何一次發佈中改變。
:::

## 這個功能做什麼

[`tsp-avro`](./avro-schemas) 把 model 描述成 Avro record。它自己的 emitter 會把 record 寫成 `.avsc` 檔案。

本 emitter 呼叫同一套走訪。那套走訪回傳的 schema 就是 AsyncAPI message 的 payload。所以資料只描述一次，文件與 `.avsc` 檔案帶的是同一份 schema。

沒開這個功能時，`tsp-avro` 的 decorator 在這裡不造成任何差異。那些 model 會和其他 model 一樣轉成 JSON Schema。

## 開啟方式

先在本 emitter 旁邊安裝 Avro 套件。

```bash
npm install "tsp-avro@0.2.x"
```

本版支援該套件的 `0.2.x` 範圍。`tsp-avro` 是本 emitter 的選用 peer dependency。沒開這個功能的專案不必安裝它，也不會載入它。

再於 `tspconfig.yaml` 指名這個功能。

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["avro"]
```

[`preview-features`](../reference/emitter-options#預覽功能) 的保留名稱是 `protobuf` 與 `avro`。本版兩個都可以使用。

## 撰寫來源

下面這份是 repository 裡的 [`examples/18-avro-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/18-avro-payloads)。它有一個 Avro namespace、兩個 record，以及一個帶 schema registry 的 Kafka 叢集。以下節錄該檔案的幾個片段，完整檔案在 repository 裡。

`@Avro.avroNamespace` 標記一個 namespace，底下每一個 Avro 名稱都由它限定。

```typespec
@Avro.avroNamespace("com.example.orders")
namespace Orders {
```

`@Avro.avroRecord` 標記一個 model，讓它成為一個 Avro record。`@message` 則把同一個 model 標記成文件的一個 message。兩個 decorator 回答的問題不同，所以帶 Avro payload 的 message 兩個都要有。

```typespec
  /**
   * One order a customer placed.
   */
  @message
  @contentType("application/vnd.apache.avro")
  @Avro.avroRecord
  @kafkaMessage(#{ schemaIdLocation: "payload", schemaLookupStrategy: "TopicIdStrategy" })
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

Avro 沒有描述 record 走哪些 topic。所以 channel 的寫法與其他 payload 完全一樣。

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

## emitter 寫出什麼

payload 是一個 [Multi Format Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#multiFormatSchemaObject)。`schemaFormat` 指名 Avro 1.9.0，`schema` 帶著 schema 本身。

schema 是物件，不是字串。Avro 本身就是 JSON，而 AsyncAPI 對 JSON 類的格式採內嵌，不用文字承載。以下是範例裡的 `OrderPlaced` message，內容取自 `asyncapi.yaml`：

```yaml
components:
  messages:
    OrderPlaced:
      name: OrderPlaced
      description: One order a customer placed.
      contentType: application/vnd.apache.avro
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

## 運作方式

compiler 執行 `tsp-avro` 的 decorator，每一個都記下自己收到的內容。`@Avro.avroNamespace` 記下一個 TypeSpec namespace 的 Avro namespace。`@Avro.avroRecord` 記下一個 model 是 Avro record。其餘 decorator 記下 Avro 有而 TypeSpec 說不出來的東西，例如 logical type 或別名。

本 emitter 不讀那些紀錄。它載入 `tsp-avro`，呼叫那個套件既有的走訪。所以 Avro emitter 與本 emitter 從同一套走訪算繪出同一份 schema，兩者不會各自漂移。

載入發生在執行期，而且只在功能開啟時發生。`tsp-avro` 是實驗性套件，本套件不是。靜態 import 會把穩定發佈綁在一個尚未進入 1.0 的版本範圍上。沒開這個功能的專案不會載入它。

走訪在這裡是收集拒絕原因，而不是回報它們。同時產生 `.avsc` 檔案與文件的專案，否則會把每一條拒絕讀到兩次，兩個 emitter 各一次。所以本 emitter 把原因帶進自己的診斷，一次編譯只用一種口徑說話。

## 一併寫出 `.avsc` 檔案

兩個 emitter 互相獨立。專案同時需要磁碟上的檔案時，在 `emit` 裡兩個都列出來。

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

檔案與 payload 帶的是同一份 schema。檔案是那份 schema 的 JSON 文字，payload 是同一份 schema 的物件。所以不論檔案有沒有寫出，payload 都一樣。

## headers 不會進 payload

`@header` 把屬性移出 payload，改成描述在 message 旁邊。產生的 Avro payload 略過它，理由與 JSON Schema payload 相同。

所以一個把 `traceId` 標上 `@header` 的 message，產生的 Avro record 裡沒有 `traceId` 欄位。那個屬性改為描述在 message 的 `headers` 裡。

::: warning
`tsp-avro` 寫出的 `.avsc` 檔案仍然宣告 `traceId`。那個套件不讀任何 AsyncAPI decorator，而 Avro 沒有 message header 這個概念。所以檔案與 payload 描述的欄位不同，emitter 會回報 [`avro-record-keeps-header`](../reference/diagnostics#avro-record-keeps-header)。
:::

要讓兩者一致，把 headers 移進自己的 model，用 [`@headers`](../reference/decorators/messages#headers) 指向它。這樣沒有東西離開 payload，record 與檔案就會一致。

## Avro 沒有描述的部分

Avro 描述資料。它沒有描述 message 走哪一個 channel、message 的方向，也沒有描述應用的 operation。

所以 `@channel`、`@send`、`@receive` 與 `@message` 仍然必要。只帶 `@Avro.avroRecord` 而沒有 `@AsyncAPI.message` 的 model 不會拿到 payload，也不會回報任何診斷。

## 作者手寫的 payload

[`@rawPayload`](../reference/decorators/messages#rawpayload) 用來手寫其他語言的 schema。那是作者的明示宣告，所以優先於產生的 schema。

同時帶兩者的 model 會回報 [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source)。文件保留作者手寫的 schema。要改用產生的 schema，就從該 model 移除 `@rawPayload`。

## 取不到 schema 的情況

Avro 走訪會拒絕 Avro 承載不了的構造。繼承、匿名 model、template 執行個體、無號整數，以及同一個型別出現兩次的 union，每一種都會被拒絕。[Avro schema 指南](./avro-schemas)列出全部的拒絕條件。

文件指名的 model 被拒絕時，會回報 [`avro-artifact-unavailable`](../reference/diagnostics#avro-artifact-unavailable)。訊息裡引述走訪給出的原因。

只引述第一條原因。走訪碰到拒絕之後會繼續走，所以一個 model 可能累積多條。本 emitter 對一個 model 只回報一條診斷，那條診斷只帶第一條原因。所以有多個問題的 model 在這裡只顯示其中一個。要讀到全部，把 `tsp-avro` 放進 `emit` 再編譯一次，它自己的 emitter 會回報每一條原因。

emitter 選擇回報問題，而不是退回那個 TypeSpec model 產生的 schema。文件也不會寫出，因為退回 JSON Schema 的文件等於在沒有說明的情況下回應了 Avro 的請求。

## 套件不存在的情況

這個功能在第一次需要時載入 `tsp-avro`。載入失敗會回報 [`avro-library-missing`](../reference/diagnostics#avro-library-missing)，訊息裡引述載入時回報的內容。

作者寫下 `@Avro.avroRecord`，所以只要有 model 帶著它，套件就已經安裝。載入失敗代表安裝壞了。請在本 emitter 旁邊安裝 `tsp-avro`，或是從 `preview-features` 移除 `avro`。
