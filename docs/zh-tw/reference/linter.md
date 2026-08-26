---
outline: 2
---

# Linter 規則

linter 回報 emitter 會接受的錯誤。這些寫法都產出合法的 AsyncAPI 文件，但都不是作者要的那份文件。

規則在語意分析階段執行，不會執行 emitter。所以裝了 TypeSpec 編輯器擴充之後，規則在你打字時就會顯示。沒有設定任何 emitter 時，規則一樣會回報。

## 規則與診斷的差別

兩者都出現在 compiler 輸出裡，但不是同一種東西。

|          | 診斷                  | lint 規則             |
| -------- | --------------------- | --------------------- |
| 何時執行 | emitter 執行時        | 語意分析階段          |
| 何時啟用 | 一律啟用              | 只在你開啟時          |
| 嚴重度   | 錯誤或警告            | 只能是警告            |
| 代碼     | `tsp-asyncapi/<code>` | `tsp-asyncapi/<rule>` |

[診斷](./diagnostics)是一份契約。emitter 只要發現問題就回報。它不能停止回報，否則會破壞使用者。

規則是你自己的選擇。所以規則可以對「不算錯」的寫法說「你大概不是這個意思」。

## 開啟 linter

在 `tspconfig.yaml` 加一段 `linter`：

```yaml
emit:
  - "tsp-asyncapi"

linter:
  extends:
    - "tsp-asyncapi/recommended"
```

`recommended` 收錄會抓到錯誤的規則。一條規則要進去，條件是「你幾乎確定不是這個意思」。

只開啟單一規則：

```yaml
linter:
  enable:
    "tsp-asyncapi/unused-security-scheme": true
```

要從繼承的規則集裡關掉某一條，要寫明理由：

```yaml
linter:
  extends:
    - "tsp-asyncapi/recommended"
  disable:
    "tsp-asyncapi/channel-without-operation": "本服務描述它不提供的 channel。"
```

`all` 會啟用全部規則，包含不在 `recommended` 裡的那些。

## 規則

每一條規則都是警告。lint 規則無法是錯誤。

### `missing-service`

在 `recommended` 內。

> This program declares AsyncAPI content but no `@service`. The emitted document falls back to the title "AsyncAPI Document" and the version "0.0.0".

`info.title` 與 `info.version` 是必填欄位。沒有任何 namespace 標上 `@service` 時，emitter 用預設值填這兩個欄位。文件是合法的，而那兩個值夠像真的，review 時很容易放過。

規則需要有 channel 才會回報。應用程式會宣告 channel，只放 `@message` model 的共用 library 不會。那種 library 本來就刻意沒有自己的 `@service`。

```typespec
// 會回報。
namespace Orders;

@message
model OrderCreated {
  id: string;
}
```

**修法：** 在描述這個應用程式的 namespace 上加 `@service`。

### `channel-without-operation`

在 `recommended` 內。

> Channel '\<id\>' carries messages but no operation marked `@send` or `@receive`.

`@send` 與 `@receive` 決定一個 operation 會不會進入 `operations`。message 要抵達 channel 則不需要這兩個 decorator。emitter 無論如何都會讀 channel 周圍那些 operation 的簽章。

所以少寫這兩個 decorator 的 channel，照樣帶著 message 被輸出。文件裡則沒有任何地方說明誰發送、誰接收。

```typespec
// 會回報。publish 把 OrderCreated 帶到 channel 上，
// 但文件沒有描述任何流量。
@channel("orders.created")
interface OrderChannel {
  op publish(event: OrderCreated): void;
}
```

兩種情況下規則保持安靜。channel 沒有任何 message 時，由 [`channel-no-messages`](./diagnostics) 負責。channel 只透過 `@replyChannel` 接收回覆時，它本來就不擁有 operation。

**修法：** 在這個 channel 的 operation 上加 `@send` 或 `@receive`。

### `operation-without-message`

在 `recommended` 內。

> Operation '\<name\>' names no `@message` model, so the emitted operation carries no `messages` field.

AsyncAPI 把「沒有 `messages` 欄位的 operation」讀成**承載該 channel 的所有 message**。空陣列的意思相反，所以 emitter 選擇省略欄位而不是輸出空陣列。

沒有被 `@message` 標記的 model 是 payload 或 channel 參數，不貢獻任何 message。只由這種 model 組成的 operation，因此宣稱了它 channel 上的每一個 message。

```typespec
// 會回報。publish 沒有指名任何 message，於是它宣稱了 OrderCreated。
@channel("orders.{id}")
interface OrderChannel {
  @receive
  op consume(event: OrderCreated): void;

  @send
  op publish(id: string): void;
}
```

**修法：** 在這個 operation 承載的 model 上加 `@message`。

### `server-protocol-mismatch`

在 `recommended` 內。

> This '\<binding\>' server binding names a protocol no server here speaks.

server 層的 binding 記錄在 namespace 上，所以該 namespace 宣告的每一個 `@server` 都會拿到它。binding 與其中任何一個 server 都對不上時，這條連線就被描述錯了。文件會用另一個通訊協定的設定去描述它。

```typespec
// 會回報。文件說是 MQTT，設定卻是 Kafka 的。
@service(#{ title: "Orders" })
@server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
@kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
namespace Orders;
```

同一個通訊協定的加密傳輸會被接受。`kafka-secure` 屬於 Kafka，`smf` 屬於 Solace。

namespace 可以宣告多種通訊協定的 server。只要其中一個對得上，規則就不回報。binding 會送到全部的 server，而那正是原始碼要求的行為。

**修法：** 改掉 `@server` 的 `protocol`，或移除這個 binding。

### `protobuf-content-type-undeclared`

在 `recommended` 裡。只在 [`preview-features`](./emitter-options#預覽功能) 指名 `protobuf` 時執行。

> Message '\<name\>' declares the content type '\<contentType\>', but nothing gives it a Protobuf payload.

`@contentType` 說明線上的位元組如何編碼，它不產生那些位元組。所以一個 message 可以指名 Protobuf 媒體型別，而它的 payload 仍然由 TypeSpec model 降級而來。這樣的文件等於叫消費端用 Protobuf 解碼，卻用 JSON Schema 描述同一批位元組。

```typespec
// 會回報。content type 說是 Protobuf，payload 卻是 JSON Schema。
@Protobuf.package({ name: "com.example.orders" })
namespace Orders {
  @message
  @contentType("application/vnd.google.protobuf")
  model OrderPlaced {
    id: string;
  }
}
```

兩種寫法會給 message 一份 Protobuf payload，任一種都會讓這條規則安靜。`@Protobuf.message` 加上每個屬性的 `@Protobuf.field`，讓預覽功能算繪出 schema。`@rawPayload` 則帶著作者自己寫的文字。

規則讀媒體型別本身，忽略分號後面的內容，所以 `;version=3` 這種參數不會遮住問題。`application/vnd.google.protobuf`、`application/x-protobuf`、`application/protobuf` 與 `application/octet-stream+protobuf` 都算。

**修法：** 加上 `@Protobuf.message` 與每個屬性的 `@Protobuf.field`，或用 `@rawPayload` 寫下 schema。

### `protobuf-field-on-header`

在 `recommended` 裡。不論 [`preview-features`](./emitter-options#預覽功能) 有沒有指名 `protobuf` 都會執行。

> Property '\<name\>' of message '\<message\>' carries both @header and @Protobuf.field.

`@header` 把屬性移出 payload。`@Protobuf.field` 給它一個 proto message 裡的位置。兩句話各自對一個檔案成立。官方 emitter 寫出的 `.proto` 檔案宣告了那個欄位，AsyncAPI 的 payload 則不帶它。所以同一個 message 在兩個檔案裡形狀不同。

```typespec
// 會回報。traceId 是 proto message 的第 1 欄，卻不在 payload 裡。
@Protobuf.package({ name: "com.example.orders" })
namespace Orders {
  @message
  @Protobuf.message
  model OrderPlaced {
    @header @Protobuf.field(1) traceId: string;
    @Protobuf.field(2) orderId: string;
  }
}
```

這條規則不等預覽功能。官方 emitter 兩種情況都會寫出 `.proto` 檔案，`@header` 兩種情況也都會把屬性移出 payload。

預覽功能開著時，同一種組合另外會報一個錯誤。產生的 payload 略過那個屬性，所以那個欄位編號指向一個 payload 裡沒有位置的欄位。

**修法：** 把 headers 移進自己的 model，用 `@headers` 指向它。這樣 proto message 與 payload 就會描述同一組欄位。

### `avro-content-type-undeclared`

在 `recommended` 裡。只在 [`preview-features`](./emitter-options#預覽功能) 指名 `avro` 時執行。

> Message '\<name\>' declares the content type '\<contentType\>', but nothing gives it an Avro payload.

`@contentType` 說明線上的位元組如何編碼，它不產生那些位元組。所以一個 message 可以指名 Avro 媒體型別，而它的 payload 仍然由 TypeSpec model 降級而來。這樣的文件等於叫消費端用 Avro 解碼，卻用 JSON Schema 描述同一批位元組。

```typespec
// 會回報。content type 說是 Avro，payload 卻是 JSON Schema。
@Avro.`namespace`("com.example.orders")
namespace Orders {
  @message
  @contentType("application/vnd.apache.avro")
  model OrderPlaced {
    id: string;
  }
}
```

兩種寫法會給 message 一份 Avro payload，任一種都會讓這條規則安靜。`` @Avro.`record` `` 讓預覽功能算繪出 schema。`@rawPayload` 則帶著作者自己寫的 schema。`record` 與 `namespace` 是 TypeSpec 的保留字，所以兩個 decorator 名稱都要加上反引號。

規則讀媒體型別本身，忽略分號後面的內容，所以 `;version=1.9.0` 這種參數不會遮住問題。`application/vnd.apache.avro`、`application/vnd.apache.avro+json` 與 `application/vnd.apache.avro+yaml` 都算。

**修法：** 加上 `` @Avro.`record` ``，或用 `@rawPayload` 寫下 schema。

### `unused-security-scheme`

不在 `recommended` 內，要指名開啟。

> Security scheme '\<name\>' is declared but no `@useSecurity` names it.

emitter 會把每一個 `@securityScheme` 寫進 `components.securitySchemes`，不管有沒有東西指名它。把 scheme 掛到 server 上的是 `@useSecurity`。

這條規則不在 `recommended` 裡。「宣告了卻沒有人指名的 scheme」是一種真實的意圖。`components.securitySchemes` 是一份登錄表。文件可以先公布一種驗證方式，即使目前沒有 channel 要求它。

```typespec
// 開啟這條規則時會回報。沒有任何地方要求 kafka-scram。
@service(#{ title: "Orders" })
@securityScheme("kafka-scram", #{ type: "scramSha512" })
@server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
namespace Orders;
```

**修法：** 在有宣告 server 的 namespace 上加 `@useSecurity`，或移除這個 scheme。

## linter 不做的事

linter 不重複既有的診斷。emitter 會回報 103 個診斷，其中 49 個要等到它執行才發出。

把診斷改寫成規則，等於同一個檢查有兩份實作。兩份會隨時間漂移。嚴重度也會改變：那 49 個當中有 15 個是錯誤，而規則只能是警告。

所以上面這些規則，涵蓋的都是沒有任何診斷涵蓋的錯誤。
