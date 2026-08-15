# Decorator

本頁列出這個 library 宣告的所有 decorator 的精確簽章，以及 emitter 會讀取的 compiler 內建 decorator。`import "typespec-asyncapi";` 加 `using AsyncAPI;` 之後即可使用。

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

附加外部文件連結。target 宣告為 `unknown`，因為 external docs 之後也會能標在 operation 與 message 上。**目前 emitter 只讀取 service namespace 上的**，輸出到 `info.externalDocs`：

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

## `@oneOf`

```typespec
extern dec oneOf(target: Union);
```

標註在 union 上，輸出 `oneOf`（恰好一個 variant 成立）取代預設的 `anyOf`（至少一個成立）。在 [schema 轉換層](../guide/schema-conversion#union)生效：

```typespec
@oneOf
union Shape {
  circle: Circle,
  square: Square,
}
```

```yaml
Shape:
  oneOf:
    - $ref: "#/components/schemas/Circle"
    - $ref: "#/components/schemas/Square"
```

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
- **message key 不帶 namespace 前綴，schema key 會帶**。`namespace Sales` 裡的 `@message model Ev` 會產出 message key `Ev` 與 schema key `Sales.Ev`。當某個 message key 剛好等於另一個型別的 schema key 時，emitter 會回報 [`message-key-shadows-schema-key`](./diagnostics#message-key-shadows-schema-key)。

## `@jsonSchemaExtension`

```typespec
extern dec jsonSchemaExtension(target: Model | ModelProperty, key: valueof string, value: valueof unknown);
```

在目標的輸出 schema 加一組原始 key/value。這是沒有專屬 decorator 時的逃生口。可重複套用，每次加一組。extension key 會蓋過 emitter 自己產生的同名關鍵字。

```typespec
@jsonSchemaExtension("unevaluatedProperties", false)
model Strict {
  id: string;
}
```

```yaml
Strict:
  type: object
  properties:
    id:
      type: string
  required:
    - id
  unevaluatedProperties: false
```

## emitter 會讀的內建 decorator

以下來自 `@typespec/compiler`，不需要 import：

| Decorator                                                                                                                                         | 在本 emitter 的效果                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@service(#{ title })`                                                                                                                            | 標記 service namespace。`title` → `info.title`。一份文件一個 service。第二個會警告（[`multiple-services`](./diagnostics#multiple-services)）並忽略。 |
| `@tag("name")`                                                                                                                                    | 每次套用產生一筆 `info.tags`。                                                                                                                       |
| `@doc` / 文件註解                                                                                                                                 | `description`。在 namespace 上是 `info.description` 的後備。在 schema 層的宣告與屬性上也生效。                                                       |
| `@summary`                                                                                                                                        | schema 的 `title`。                                                                                                                                  |
| `@example(#{...})`                                                                                                                                | schema `examples` 的一個項目，序列化為 JSON。                                                                                                        |
| `@discriminator("prop")`                                                                                                                          | schema 的 `discriminator`。見[繼承](../guide/schema-conversion#繼承與-discriminator)。                                                               |
| `@encodedName("application/json", "wire_name")`                                                                                                   | 改寫 schema 的屬性 key。見 [wire key](../guide/schema-conversion#改寫-wire-key-encodedname)。                                                        |
| `@friendlyName("{name}X", T)`                                                                                                                     | 覆寫宣告的 `components.schemas` key。                                                                                                                |
| `@minLength`、`@maxLength`、`@pattern`、`@format`、`@minValue`、`@maxValue`、`@minValueExclusive`、`@maxValueExclusive`、`@minItems`、`@maxItems` | 驗證關鍵字。見[對應表](../guide/schema-conversion#驗證-decorator)。                                                                                  |

::: tip
schema 層的 decorator（`@oneOf`、`@jsonSchemaExtension` 與形塑 schema 的內建 decorator）目前只在轉換層生效。見 [Schema 轉換](../guide/schema-conversion)開頭的狀態說明。
:::
