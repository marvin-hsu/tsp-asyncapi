# 結構與內建 (Schemas)

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
