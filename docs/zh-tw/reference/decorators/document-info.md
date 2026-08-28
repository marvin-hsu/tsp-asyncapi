---
title: "Document Info"
description: "填入 service namespace 的 AsyncAPI `info` 區塊。參數的形狀："
---

# Document Info

## `@info`

```typespec
extern dec info(target: Namespace, info: valueof AsyncAPIInfo);
```

填入 service namespace 的 AsyncAPI `info` 區塊。參數的形狀：

| 欄位             | 型別                      | 必填 |
| ---------------- | ------------------------- | ---- |
| `version`        | `string`                  | 是   |
| `description`    | `string`                  | 否   |
| `termsOfService` | `string`                  | 否   |
| `contact`        | `{ name?, url?, email? }` | 否   |
| `license`        | `{ name, url? }`          | 否   |

```typespec
@service(#{ title: "Order Service API" })
@info(#{
  version: "1.0.0",
  description: "Order events.",
  contact: #{ name: "API Support", email: "support@example.com" },
  license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
})
namespace Orders;
```

```yaml
info:
  title: Order Service API
  version: 1.0.0
  description: Order events.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
```

沒有 `@info` 時，`info.version` 後備為 `0.0.0`。若 `@info` 沒給 `description`，改用 namespace 上的 `@doc`（或 `/** ... */` 文件註解）。

每個 namespace 只能套用一次 `@info`。第二次套用會回報 [`duplicate-info-decorator`](../diagnostics#duplicate-info-decorator) 並被丟棄。

所有文字欄位都會去除前後空白。留白的欄位視同沒給。`version` 留白會回報 [`empty-info-version`](../diagnostics#empty-info-version)，版本後備為 `0.0.0`。

`license.name` 是必填欄位。留白會回報 [`empty-license-name`](../diagnostics#empty-license-name)，整個 license 會被丟掉。`contact` 的每個欄位都留白時，整個 contact 不會輸出，而不是輸出空物件。

`termsOfService`、`contact.url` 與 `license.url` 都必須是絕對 URL。AsyncAPI 對這些欄位標了 `uri` 格式。不合格的值會回報 [`invalid-url`](../diagnostics#invalid-url)，只有該欄位被丟棄。

## `@externalDocs`

```typespec
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
```

附加外部文件連結。target 宣告為 `unknown`，因為 external docs 可以標在多種位置上。emitter 會讀取其中六處：

| 標在哪裡                                  | 輸出到哪裡                     |
| ----------------------------------------- | ------------------------------ |
| service namespace                         | `info.externalDocs`            |
| 標有 `@server` 的 namespace               | 它宣告的每一個 server          |
| `@message` model                          | 該 message 的 `externalDocs`   |
| 任何會變成 schema 的 model、scalar 或屬性 | 該 schema 的 `externalDocs`    |
| `@channel` interface                      | 該 channel 的 `externalDocs`   |
| `@send`／`@receive` operation             | 該 operation 的 `externalDocs` |

`@message` model 會同時輸出到 message 與它的 payload schema，`@doc` 本來就是這樣。

server 來自 service namespace，而 `info` 讀的是同一個 namespace，所以標在該 namespace 的一個連結會出現在兩處。AsyncAPI 在兩種物件上都定義了 `externalDocs`。

`url` 必須是絕對 URL。AsyncAPI 對這個欄位標了 `uri` 格式，相對路徑（例如 `/docs`）會讓 parser 拒絕整份文件。url 不是絕對 URL 時，emitter 回報 [`invalid-url`](../diagnostics#invalid-url) 錯誤，並丟棄這次標記。

```typespec
@externalDocs("https://example.com/docs", "Service Documentation")
namespace Orders;
```

```yaml
info:
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
```

```typespec
@message
@externalDocs("https://example.com/order-created", "How to consume this message.")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      externalDocs:
        url: https://example.com/order-created
        description: How to consume this message.
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

## `@asyncTag`

```typespec
extern dec asyncTag(target: unknown, name: valueof string, metadata?: valueof AsyncAPITag);

model AsyncAPITag {
  description?: string;
  externalDocs?: ExternalDocs;
}

model ExternalDocs {
  url: string;
  description?: string;
}
```

在輸出的物件上加一個 tag 與它的 metadata。可重複套用：每次套用加一個 tag，輸出的陣列依原始碼順序排列。

名字刻意取為 `asyncTag` 而非 `tag`，內建的 `@tag` 才不會有歧義。

它與內建 `@tag` 有兩點不同：

|        | 內建 `@tag`                           | `@asyncTag`                              |
| ------ | ------------------------------------- | ---------------------------------------- |
| 參數   | 只有名字                              | 名字加上 `description` 與 `externalDocs` |
| target | `Namespace \| Interface \| Operation` | 任何型別，包含 `Model`                   |

message 是 model，所以**內建 `@tag` 根本標不到 message 上**，編譯器會直接拒絕該次套用。

```typespec
@message
@asyncTag("orders", #{
  description: "Everything about orders.",
  externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
})
@asyncTag("public")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      tags:
        - name: orders
          description: Everything about orders.
          externalDocs:
            url: https://example.com/orders
            description: The order guide.
        - name: public
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

emitter 會在五個位置讀取它：

| 標在哪裡                      | 輸出到哪裡             |
| ----------------------------- | ---------------------- |
| service namespace             | `info.tags`            |
| 標有 `@server` 的 namespace   | 它宣告的每一個 server  |
| `@message` model              | 該 message 的 `tags`   |
| `@channel` interface          | 該 channel 的 `tags`   |
| `@send`／`@receive` operation | 該 operation 的 `tags` |

server 來自 service namespace，而 `info` 讀的是同一個 namespace，所以標在該 namespace 的一個 tag 會出現在兩處。AsyncAPI 在兩種物件上都定義了 `tags`。每個 server 各持一份副本，所以改動其中一個 server 的 tag 不會影響另一個。

名稱不可為空字串。AsyncAPI Tag Object 的 `name` 是必填欄位，空白的名稱沒有任何 consumer 比對得到。所以 `@asyncTag("")` 回報 [`empty-tag-name`](../diagnostics#empty-tag-name)，該 tag 被丟棄。

### 合併規則

同一個物件上，一個名字只會輸出一個 Tag Object。同一個 target 上兩次套用指到同一個名字時，逐欄位合併：

- **內建 `@tag` 與 `@asyncTag` 同名。** 合併，以 metadata 為準。內建 decorator 只帶名字，沒有任何可以互相牴觸的內容。
- **兩個 `@asyncTag` 同名、各自設定不同欄位。** 合併。一邊的 `description` 與另一邊的 `externalDocs` 組成同一個 Tag Object。
- **兩個 `@asyncTag` 同名、同一個欄位給了兩個不同的值。** 這是 [`conflicting-tag-metadata`](../diagnostics#conflicting-tag-metadata) error。該欄位保留原始碼順序中第一次套用的值。

同一個名字出現在**兩個不同的 target** 上、帶不同的 metadata，不算錯誤。AsyncAPI 讓每個物件各自持有獨立的 `tags` 陣列。

## `@extension`

```typespec
extern dec extension(target: unknown, key: valueof string, value: valueof unknown);
```

在 target 產生的物件上加一個 `x-` 規格擴充欄位。值可以是任何 JSON 值，照原樣輸出。

可重複套用：每次套用加一個 key。輸出的 key 依原始碼順序排列，並排在該物件所有規格欄位之後。

emitter 會在四個位置讀取它：

| 標在哪裡                      | 輸出到哪裡        |
| ----------------------------- | ----------------- |
| service namespace             | `info`            |
| `@channel` interface          | 該 channel 物件   |
| `@send`／`@receive` operation | 該 operation 物件 |
| `@message` model              | 該 message 物件   |

一個 target 產生多個物件時，每個物件都拿到這組欄位。同時是 service 又是 channel 的 namespace 就是這種 target。

key 必須符合 AsyncAPI 規格擴充的樣式 `^x-[\w\d\.\-\_]+$`。也就是 `x-` 加上一個以上的英文字母、數字、底線、點或連字號。AsyncAPI 不把其他 key 讀成規格擴充。不合樣式的 key 回報 [`invalid-extension-key`](../diagnostics#invalid-extension-key)，這次套用被丟棄。

同一個 target 上的一個 key 只取一個值。同一個 key 第二次套用回報 [`duplicate-extension-key`](../diagnostics#duplicate-extension-key)，保留原始碼順序中的第一次套用。

值必須是 emitter 寫得出來的 JSON。寫不出來的值回報 [`unserializable-extension`](../diagnostics#unserializable-extension)，該次套用被丟棄。

```typespec
@service(#{ title: "Order Service API" })
@info(#{ version: "1.0.0" })
@extension("x-owner", "orders-team")
@extension("x-sla", #{ tier: "gold", hours: 24 })
namespace Orders;
```

```yaml
info:
  title: Order Service API
  version: 1.0.0
  x-owner: orders-team
  x-sla:
    tier: gold
    hours: 24
```

```typespec
@message
@extension("x-schema-registry-id", 4711)
model OrderCreated {
  id: string;
}

@channel("orders.created")
@extension("x-retention-days", 7)
interface OrderChannel {
  @send
  @extension("x-audit", true)
  publishOrderCreated(payload: OrderCreated): void;
}
```

```yaml
channels:
  orders.created:
    address: orders.created
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
    x-retention-days: 7
operations:
  publishOrderCreated:
    action: send
    channel:
      $ref: "#/channels/orders.created"
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
    x-audit: true
components:
  messages:
    OrderCreated:
      name: OrderCreated
      payload:
        $ref: "#/components/schemas/OrderCreated"
      x-schema-registry-id: 4711
```

### `@extension` 與 `@jsonSchemaExtension`

兩者寫進不同的層，這條分工不會變。

|            | `@extension`                                       | [`@jsonSchemaExtension`](./schemas#jsonschemaextension) |
| ---------- | -------------------------------------------------- | ------------------------------------------------------- |
| 寫進哪裡   | AsyncAPI 物件：`info`、channel、operation、message | `components.schemas` 裡的 JSON Schema                   |
| key 的樣式 | `^x-[\w\d\.\-\_]+$`                                | 任何 key                                                |
| 典型用途   | 放在規格欄位旁邊的工具用 metadata                  | emitter 沒有專屬 decorator 的 JSON Schema 關鍵字        |

`@message` model 會同時產生一個 message 物件與一份 payload schema。標在該 model 上的 `@extension` 寫進 message 物件。要為 payload schema 加關鍵字，用 `@jsonSchemaExtension`。

### 不支援 server 與 security scheme

`@extension` 無法在 server 或 security scheme 上寫入擴充欄位。

兩者都以具名參數宣告在 namespace 上，寫法是 `@server("production", #{ ... })`。一個 namespace 可以宣告好幾個。`@extension` 的 target 是那個 namespace，所以這次套用指不出它要的是哪一個 server 或哪一個 scheme。

因此標在 service namespace 上的擴充只會落在 `info`，不會到達該 namespace 宣告的 server。這一點與 `@externalDocs` 和 `@asyncTag` 不同，那兩個會複製到每一個 server。

target 不產生上述四種物件時，回報 [`extension-target-not-emitted`](../diagnostics#extension-target-not-emitted)，該 target 上的每個擴充都被丟棄。
