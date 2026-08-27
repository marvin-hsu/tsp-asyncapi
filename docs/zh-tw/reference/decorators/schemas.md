---
title: "Schema 與內建 decorator"
description: "@oneOf 與 @jsonSchemaExtension 的精確簽章、schema key 怎麼組成，以及 schema 層會讀取的 compiler 內建 decorator。"
---

# Schema 與內建 decorator

## `@oneOf`

```typespec
extern dec oneOf(target: Union);
```

標註在 union 上，輸出 `oneOf`（恰好一個 variant 成立）取代預設的 `anyOf`（至少一個成立）。在 [schema 轉換層](../../guide/schema-conversion/unions)生效：

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

## `@jsonSchemaExtension`

```typespec
extern dec jsonSchemaExtension(target: Model | ModelProperty, key: valueof string, value: valueof unknown);
```

在目標的輸出 schema 加一組原始 key/value。沒有專屬 decorator 時用它。可重複套用，每次加一組。extension key 會蓋過 emitter 自己產生的同名關鍵字。

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

## schema key 怎麼決定

被 message 觸及的每個具名 model、enum 與 union，都在 `components.schemas` 得到一筆項目。key 依這個順序決定：

1. 有 `@friendlyName` 時，解析後的文字直接是整個 key。不加 namespace 前綴。
2. 沒有時，key 是宣告名稱，前面加上 namespace 鏈。各段用 `.` 連接。例如 `namespace Contracts.TransactionHistory` 裡的 `model WithdrawCompleted`，key 是 `Contracts.TransactionHistory.WithdrawCompleted`。

service namespace 與 compiler 內建的 `TypeSpec` namespace 會從鏈中剔除。單一 service 的 spec 裡幾乎每個宣告都住在 service namespace 底下，這一段沒有區別資訊。

住在 service namespace 之外的 library namespace 的宣告，會保留那段 namespace 當前綴。要縮短這種 key，套 `@friendlyName`。

`components.messages` 的 key 遵循同一套規則，只有兩個差異。message key 一律不帶 namespace 前綴。而 [`@message`](./messages#message) 的引數覆寫 message key，作用等同 `@friendlyName` 覆寫 schema key。

### key 的字元清理

Components Object 的 key 必須符合 `^[a-zA-Z0-9.\-_]+$`。AsyncAPI 不允許成員名稱帶其他字元。

一般的 TypeSpec 識別字本來就落在這個字元集內。它原樣成為 key，大小寫不變。`@friendlyName` 的文字與反引號括起的名稱可以帶其他字元，emitter 會改寫這些字元：

- `.`、`-`、`_` 原樣保留。
- 每個英數字片段的第一個字母改成大寫。
- 其他字元一律改寫成 `Sep` 加上該字元的 code point。例如 `has space` 變成 `HasSep32Space`。

schema key 被改寫時不回報。message key 被改寫時回報 [`sanitized-message-key`](../diagnostics#sanitized-message-key)。讓每個 `@friendlyName` 與 `@message` 引數都落在字元集內，改寫就不會發生。

## emitter 會讀的內建 decorator

以下來自 `@typespec/compiler`，不需要 import：

| Decorator                                                                                                                                         | 在本 emitter 的效果                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@service(#{ title })`                                                                                                                            | 標記 service namespace。`title` → `info.title`。一份文件一個 service。第二個會警告（[`multiple-services`](../diagnostics#multiple-services)）並忽略。 |
| `@tag("name")`                                                                                                                                    | 每次套用產生一筆 `info.tags`。它標不到 `Model`，message 的 tag 改用 [`@asyncTag`](./document-info#asynctag)。兩者指到同一個名字時會合併。             |
| `@doc` / 文件註解                                                                                                                                 | `description`。在 namespace 上是 `info.description` 的後備。在 schema 層的宣告與屬性上也生效。                                                        |
| `@summary`                                                                                                                                        | schema 的 `title`。                                                                                                                                   |
| `@example(#{...})`                                                                                                                                | schema `examples` 的一個項目，序列化為 JSON。                                                                                                         |
| `@discriminator("prop")`                                                                                                                          | schema 的 `discriminator`。見[繼承](../../guide/schema-conversion/inheritance)。                                                                      |
| `@encodedName("application/json", "wire_name")`                                                                                                   | 改寫 schema 的屬性 key。見 [wire key](../../guide/schema-conversion/modifiers)。                                                                      |
| `@friendlyName("{name}X", T)`                                                                                                                     | 覆寫宣告的 `components.schemas` key。                                                                                                                 |
| `@minLength`、`@maxLength`、`@pattern`、`@format`、`@minValue`、`@maxValue`、`@minValueExclusive`、`@maxValueExclusive`、`@minItems`、`@maxItems` | 驗證關鍵字。見[對應表](../../guide/schema-conversion/validation)。                                                                                    |

::: tip
schema 層的 decorator（`@oneOf`、`@jsonSchemaExtension` 與形塑 schema 的內建 decorator）目前只在轉換層生效。見 [Schema 轉換](../../guide/schema-conversion/)開頭的狀態說明。
:::
