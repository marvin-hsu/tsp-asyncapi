---
title: "訊息 (Messages)"
description: "把一個 model 標記為 AsyncAPI message。每個被標記的 model 會成為 `components.messages` 的一筆，其 `payload` 指向該 model 的 schema。"
---

# 訊息 (Messages)

## `@message`

```typespec
extern dec message(target: Model, name?: valueof string);
```

把一個 model 標記為 AsyncAPI message。每個被標記的 model 會成為 `components.messages` 的一筆，其 `payload` 指向該 model 的 schema。

target 必須是 `Model`。payload 只是單一 scalar 的訊息，必須把該 scalar 包進一個 model 裡。

```typespec
@message
model OrderCreated {
  orderId: string;
  amount: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      payload:
        $ref: "#/components/schemas/OrderCreated"
  schemas:
    OrderCreated:
      type: object
      properties:
        orderId:
          type: string
        amount:
          type: number
          format: double
      required:
        - orderId
        - amount
```

選填參數可覆寫 key：

```typespec
@message("order.created.v1")
model OrderCreated {
  orderId: string;
}
```

兩點要注意：

- **只有被觸及的 model 會輸出**。`components.schemas` 只收 message 能觸及的 model（直接引用或透過屬性間接引用）。沒有任何 message 引用到的 model 不會出現。
- **message key 不帶 namespace 前綴，schema key 會帶**。`namespace Sales` 裡的 `@message model Ev` 會產出 message key `Ev` 與 schema key `Sales.Ev`。當某個 message key 剛好等於另一個型別的 schema key 時，emitter 會回報 [`message-key-shadows-schema-key`](../diagnostics#message-key-shadows-schema-key)。

## `@contentType`

```typespec
extern dec contentType(target: Model, contentType: valueof string);
```

設定 message payload 的媒體型態（media type）。沒有標記時不輸出這個欄位，改由文件層級的 `defaultContentType` 生效。

```typespec
@message
@contentType("application/avro")
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      contentType: application/avro
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

emitter 原樣輸出這個字串。它不解析媒體型態，也不會因此改變 payload schema。

每個 model 只套用一次。一個 message 只有一個 content type，所以第二次套用回報 [`duplicate-content-type-decorator`](../diagnostics#duplicate-content-type-decorator)。

媒體型態不可以是空字串。空白的媒體型態沒有指出任何格式。emitter 回報 [`empty-content-type`](../diagnostics#empty-content-type) 並丟棄這次套用。這個 message 接著退回文件層級的 `defaultContentType`。

## `@header`

```typespec
extern dec header(target: ModelProperty);
```

把 message model 的一個欄位標記為 message header。emitter 會把每個被標記的欄位從 payload schema 抽出來，集中放進該 message 的 `headers` schema。payload 只留沒有被標記的欄位。

```typespec
@message
model OrderCreated {
  @header
  correlationId: string;

  @header
  retryCount?: int32;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
          retryCount:
            type: integer
            format: int32
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
      required:
        - orderId
```

五點要注意：

- **這個 decorator 不收名稱參數**。`@typespec/http` 的 `@header` 有名稱參數，是因為 HTTP 會把欄位名改寫成 kebab-case。AsyncAPI 的 application headers 沒有這個慣例。若 header 的 key 不是合法的 TypeSpec 識別字，用 [`@encodedName`](#emitter-會讀的內建-decorator) 指定，寫法與改 payload 欄位名相同。
- **只有 `@message` model 的頂層欄位會被抽出**。payload 更深層的標記會回報 [`nested-header-ignored`](../diagnostics#nested-header-ignored)，該欄位留在 payload。headers 本身要有巢狀結構時，改用 `@headers`。
- **`extends` 與 `...` 在這裡行為不同**。展開語法 `...Base` 把屬性複製進 message model，被標記的屬性成為 message 自己的欄位，會被抽出。`extends Base` 則讓屬性留在 base model 上，payload 用 `allOf` 引用它。抽走它會影響所有繼承同一個 base 的 model，所以 emitter 保留該欄位並回報 [`inherited-header-ignored`](../diagnostics#inherited-header-ignored)。
- **payload 會拿到自己的一份 component**。抽出只影響宣告 header 的那個 message。model 自己的 `components.schemas` 項目保留全部欄位，所以 subtype、其他 message 的欄位型別，以及任何其他讀取者，看到的都是完整結構。message 指向第二份 component，key 是 `<Model>Payload`，裡面只有留下來的欄位。若你自己已經宣告了名為 `<Model>Payload` 的 model，emitter 回報 [`duplicate-schema-key`](../diagnostics#duplicate-schema-key)，該 message 退回指向 model 自己的 component。
- **名為 `content-type` 的 header 欄位會與 `@contentType` 衝突**。AsyncAPI 只有一個欄位表示 content type，所以 emitter 回報 [`content-type-header-conflict`](../diagnostics#content-type-header-conflict)，不自行挑一個來源。

## `@headers`

```typespec
extern dec headers(target: Model, headers: Model);
```

用一個獨立的 model 設定整個 message 的 `headers` schema。headers 自成一個 model、或 headers 需要巢狀結構時用它。emitter 會把該 model 輸出到 `components.schemas` 並以 `$ref` 引用，所以多個 message 可以共用同一份 headers 定義。

```typespec
model MqmdFields {
  CorrelId: string;
}

model ShippingHeaders {
  MQMD: MqmdFields;
}

@message
@headers(ShippingHeaders)
model OrderShipped {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderShipped:
      name: OrderShipped
      headers:
        $ref: "#/components/schemas/ShippingHeaders"
      payload:
        $ref: "#/components/schemas/OrderShipped"
```

這個 model 必須是 object 型態。AsyncAPI 要求 headers schema 描述一組 key/value map，所以 array 為底的 model 會回報 [`headers-not-object`](../diagnostics#headers-not-object)。

同一個 message 不要同時用欄位層級的 `@header` 或 `@rawHeaders`。兩個來源沒有明確的優先序，所以 emitter 回報 [`duplicate-message-headers`](../diagnostics#duplicate-message-headers)，且兩邊都不輸出。

headers model 上名為 `content-type` 的屬性，與 message 上的 `@contentType` 衝突，情形和欄位層級的同名 `@header` 相同。emitter 回報 [`content-type-header-conflict`](../diagnostics#content-type-header-conflict)。headers model 繼承來的屬性也會檢查。

## `@rawPayload`

```typespec
extern dec rawPayload(target: Model, schemaFormat: valueof string, schema: valueof unknown);
```

用另一種格式的 schema 描述 message 的 payload，例如 Avro 或 Protobuf。AsyncAPI 稱這個結果為 Multi Format Schema Object。emitter 把 `schemaFormat` 與 `schema` 寫進 message，並且原樣輸出 `schema`。

emitter 不解讀 schema 的內容。所以它無法檢查 schema 是否符合該格式，也無法檢查 schema 是否符合這個 model。

```typespec
@message
@contentType("application/avro")
@rawPayload(
  "application/vnd.apache.avro;version=1.9.0",
  #{
    type: "record",
    name: "OrderCreated",
    fields: #[#{ name: "orderId", type: "string" }],
  }
)
model OrderCreated {}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      contentType: application/avro
      payload:
        schemaFormat: application/vnd.apache.avro;version=1.9.0
        schema:
          type: record
          name: OrderCreated
          fields:
            - name: orderId
              type: string
```

這個 model 不描述任何進入這個 message 的內容。它不再是 schema 走訪的起點，所以自己不佔用 `components.schemas` 的 key。它引用的 model 也一樣。但它沒有被排除在走訪之外。若有其他 message 引用到這個 model，或引用到它所引用的 model，那個 model 仍然會被收集。被收集的 model 會拿到一般的 `components.schemas` 項目，屬性也會一併輸出。這個 model 只是承載 message decorator 的載體，所以把它的內容留空。

raw schema 直接寫進 message，不寫進 `components.schemas`。所以目前兩個 message 無法共用同一份 raw schema。

`schema` 可以是任何形狀的值。常見的形式是 object value。字串與陣列也合法，因為 AsyncAPI 把這個欄位定義為 `any`。

Avro 中名為 `namespace` 的欄位要用反引號包住，因為 `namespace` 是 TypeSpec 的保留字：``#{ `namespace`: "com.example" }``。

AsyncAPI 要求或建議的 `schemaFormat` 值不會有任何回報。其他值仍然會輸出，同時回報 [`unknown-schema-format`](../diagnostics#unknown-schema-format) 警告。空白值會回報 [`empty-schema-format`](../diagnostics#empty-schema-format)，該 message 退回使用從 model 建出來的 schema。

格式與 schema 之間有兩條規則，emitter 兩條都會回報。非 JSON 基礎的格式（例如 Protobuf）要把 schema 寫成字串。寫成 object 會回報 [`non-string-raw-schema`](../diagnostics#non-string-raw-schema)。最外層以 `#/` 開頭的 `$ref` 指向這份文件，而文件裡的每個 schema 都是 AsyncAPI Schema Object。其他格式會回報 [`raw-schema-local-ref`](../diagnostics#raw-schema-local-ref)。兩種情況下 schema 都照原樣輸出。

emitter 也會解析最外層的 `$ref`，所有格式都一樣。若 reference 在完成的文件中找不到對應位置，會回報 [`unresolved-raw-schema-ref`](../diagnostics#unresolved-raw-schema-ref)。

同一個 message 不要同時用欄位層級的 `@header`。被提升的欄位會離開 payload schema，而 emitter 無法從它不解讀的 schema 中移除欄位。emitter 回報 [`raw-payload-lifted-header`](../diagnostics#raw-payload-lifted-header)，兩邊都照樣輸出。改用 `@headers` 或 `@rawHeaders` 描述 headers。這兩個都可以與本 decorator 併用，且不會有任何回報。

同一個 model 只能套用一次。第二次套用會回報 [`duplicate-raw-payload-decorator`](../diagnostics#duplicate-raw-payload-decorator)。

## `@rawHeaders`

```typespec
extern dec rawHeaders(target: Model, schemaFormat: valueof string, schema: valueof unknown);
```

用另一種格式的 schema 描述 message 的 headers。它寫進 `headers` 欄位的 Multi Format Schema Object，與 `@rawPayload` 寫進 `payload` 的完全相同。`schemaFormat` 與 `schema` 的規則也相同。

```typespec
@message
@rawHeaders(
  "application/vnd.apache.avro;version=1.9.0",
  #{
    type: "record",
    name: "OrderHeaders",
    fields: #[#{ name: "traceId", type: "string" }],
  }
)
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        schemaFormat: application/vnd.apache.avro;version=1.9.0
        schema:
          type: record
          name: OrderHeaders
          fields:
            - name: traceId
              type: string
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

這是描述 message headers 的第三種方式。另外兩種是欄位層級的 `@header`，以及傳給 `@headers` 的 model。三者只能擇一。同時使用一種以上會回報 [`duplicate-message-headers`](../diagnostics#duplicate-message-headers)，且完全不輸出 `headers`。

raw headers 不會從 payload 提升任何欄位。所以 payload 仍然描述 model 的每一個欄位。

同一個 model 只能套用一次。第二次套用會回報 [`duplicate-raw-headers-decorator`](../diagnostics#duplicate-raw-headers-decorator)。

## `@correlationId`

```typespec
extern dec correlationId(target: Model, location: valueof string, description?: valueof string);
```

設定 message 的 `correlationId`。`location` 是 runtime expression，指出關聯值在執行期的位置。

```typespec
@message
@correlationId("$message.header#/correlationId", "把回覆與原請求關聯起來。")
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
      correlationId:
        location: "$message.header#/correlationId"
        description: 把回覆與原請求關聯起來。
```

合法的 `location` 是 `$message.header#` 或 `$message.payload#`，後面可再接一段 JSON Pointer。下列都合法：

| Location                         | 意義                 |
| -------------------------------- | -------------------- |
| `$message.header#`               | headers 物件本身     |
| `$message.header#/correlationId` | 單一 header          |
| `$message.header#/MQMD/CorrelId` | 巢狀兩層的 header    |
| `$message.payload#/order/id`     | payload 內巢狀的欄位 |

`#` 是必要的。規格的 ABNF 條文看起來像是可以省略，但規格的正規 JSON Schema 要求它，官方 AsyncAPI parser 也會拒絕帶有 `$message.header`（不含 `#`）的文件。

其他寫法回報 [`invalid-correlation-id-location`](../diagnostics#invalid-correlation-id-location)，且不輸出 `correlationId`。

emitter 只檢查格式。它不檢查該 pointer 是否指向 headers 或 payload schema 已宣告的欄位。規格沒有這項要求，官方範例本身也指向 schema 未定義的路徑。

每個 model 只套用一次。第二次套用回報 [`duplicate-correlation-id-decorator`](../diagnostics#duplicate-correlation-id-decorator)。

## `@messageExample`

```typespec
extern dec messageExample(
  target: Model,
  example: valueof MessageExampleValue,
  options?: valueof MessageExampleOptions
);
```

為 message 加上一筆範例。參數形狀：

| 欄位              | 型別              | 必填 |
| ----------------- | ----------------- | ---- |
| `example.headers` | `Record<unknown>` | 否   |
| `example.payload` | `unknown`         | 否   |
| `options.name`    | `string`          | 否   |
| `options.summary` | `string`          | 否   |

`headers` 是一組 key/value map，因為 AsyncAPI Message Example Object 把它定義為 `Map[string, any]`。`payload` 則是自由格式，規格把它定義為 `any`，所以純量 payload 也合法。

可重複套用：每次套用在 `examples` 陣列加一筆，順序照原始碼順序。AsyncAPI 的 `examples` 是陣列，所以一個 message 可以列出多種情境，每筆各有自己的 `name`。

```typespec
@message
@messageExample(
  #{ headers: #{ correlationId: "abc-123" }, payload: #{ orderId: "o-1", total: 12.5 } },
  #{ name: "smallOrder", summary: "單一品項，已付款。" }
)
@messageExample(#{ payload: #{ orderId: "o-2", total: 999.0 } }, #{ name: "largeOrder" })
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
  total: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      examples:
        - name: smallOrder
          summary: 單一品項，已付款。
          headers:
            correlationId: abc-123
          payload:
            orderId: o-1
            total: 12.5
        - name: largeOrder
          payload:
            orderId: o-2
            total: 999
```

兩點要知道：

- **每筆範例至少要有 `headers` 或 `payload` 其中之一。** 兩者皆無的範例說明不了任何事，會回報 [`empty-message-example`](../diagnostics#empty-message-example) 並捨棄該筆。
- **範例內容不會與 message schema 對照檢查。** 值照寫的原樣輸出。若某個值無法序列化為 JSON（例如自訂 scalar 的建構式），該筆整筆捨棄，並回報 [`unserializable-message-example`](../diagnostics#unserializable-message-example)。
