# Validation (驗證)

## 驗證 decorator

每個 decorator 對應同義的 draft-07 關鍵字。可以標在屬性、model 或 scalar 宣告上：

| TypeSpec decorator                          | Schema 關鍵字                           |
| ------------------------------------------- | --------------------------------------- |
| `@minLength` / `@maxLength`                 | `minLength` / `maxLength`               |
| `@pattern`                                  | `pattern`                               |
| `@format`                                   | `format`                                |
| `@minValue` / `@maxValue`                   | `minimum` / `maximum`                   |
| `@minValueExclusive` / `@maxValueExclusive` | `exclusiveMinimum` / `exclusiveMaximum` |
| `@minItems` / `@maxItems`                   | `minItems` / `maxItems`                 |

```typespec
model Product {
  @minLength(1) @maxLength(50) name: string;
  @minValue(0) @maxValueExclusive(1000000) price: float64;
  @minItems(1) @maxItems(10) tags: string[];
  @pattern("^[A-Z]{2}-\\d{4}$") sku: string;
  @format("uuid") id: string;
}
```

```yaml
Product:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 50
    price:
      type: number
      format: double
      minimum: 0
      exclusiveMaximum: 1000000
    tags:
      type: array
      items:
        type: string
      minItems: 1
      maxItems: 10
    sku:
      type: string
      pattern: ^[A-Z]{2}-\d{4}$
    id:
      type: string
      format: uuid
  required:
    - name
    - price
    - tags
    - sku
    - id
```

輸出沒有 `uniqueItems`。`@typespec/compiler` 沒有對應的 decorator。

若邊界值無法表示為 JSON 數字（例如 `int64` 上的 `@maxValue(9223372036854775807)`），或標在日期、時間、duration 值上，該關鍵字**以警告省略**，不會輸出錯的值。見 [`unrepresentable-numeric-constraint`](../../reference/diagnostics#unrepresentable-numeric-constraint) 與 [`unsupported-temporal-range-constraint`](../../reference/diagnostics#unsupported-temporal-range-constraint)。
