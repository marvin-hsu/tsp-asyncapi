# 文件資訊 (Document Info)

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

## `@externalDocs`

```typespec
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
```

附加外部文件連結。target 宣告為 `unknown`，因為 external docs 可以標在多種位置上。**目前 emitter 讀取兩處：service namespace 上的輸出到 `info.externalDocs`，`@message` model 上的輸出到該 message 的 `externalDocs`。** 標在其他位置會記錄下來，但還不會輸出。

標有 `@server` 的 namespace 也會把該連結放到它宣告的每個 server 上。server 來自 service namespace，而 `info` 讀的是同一個 namespace，所以連結會出現在兩處。AsyncAPI 在兩種物件上都定義了 `externalDocs`。

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

名字刻意取為 `asyncTag` 而非 `tag`。內建的 `@tag` 位於全域的 `TypeSpec` namespace，永遠在可見範圍內。若在 `AsyncAPI` namespace 再放一個 `tag`，使用者寫 `using AsyncAPI;` 之後的 `@tag(...)` 就會變成有歧義的識別字，既有的 `@tag` 全部得改寫成 `@TypeSpec.tag(...)`。

它與內建 `@tag` 有兩點不同：

|        | 內建 `@tag`                           | `@asyncTag`                              |
| ------ | ------------------------------------- | ---------------------------------------- |
| 參數   | 只有名字                              | 名字加上 `description` 與 `externalDocs` |
| target | `Namespace \| Interface \| Operation` | 任何型別，包含 `Model`                   |

AsyncAPI 的每個項目放的是完整的 Tag Object，OpenAPI 放的是單純的字串。message 是 model，所以**內建 `@tag` 根本標不到 message 上**，編譯器會直接拒絕該次套用。

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

emitter 目前會在 service namespace（輸出到 `info.tags`）與 message 上讀取它。標在其他位置會記錄下來，但還不會輸出。

名稱不可為空字串。AsyncAPI Tag Object 的 `name` 是必填欄位，空白的名稱沒有任何 consumer 比對得到。所以 `@asyncTag("")` 回報 [`empty-tag-name`](../diagnostics#empty-tag-name)，該 tag 被丟棄。

### 合併規則

同一個物件上，一個名字只會輸出一個 Tag Object。同一個 target 上兩次套用指到同一個名字時，逐欄位合併：

- **內建 `@tag` 與 `@asyncTag` 同名。** 合併，以 metadata 為準。內建 decorator 只帶名字，沒有任何可以互相牴觸的內容。
- **兩個 `@asyncTag` 同名、各自設定不同欄位。** 合併。一邊的 `description` 與另一邊的 `externalDocs` 組成同一個 Tag Object。
- **兩個 `@asyncTag` 同名、同一個欄位給了兩個不同的值。** 這是 [`conflicting-tag-metadata`](../diagnostics#conflicting-tag-metadata) error。該欄位保留原始碼順序中第一次套用的值。

同一個名字出現在**兩個不同的 target** 上、帶不同的 metadata，不算錯誤。AsyncAPI 讓每個物件各自持有獨立的 `tags` 陣列。
