---
title: "驗證器"
description: "TypeSpec 的驗證 decorator 會轉成 JSON Schema draft-07 的對應關鍵字，把值的範圍一起寫進輸出的 schema。"
---

# 驗證器

schema 除了描述資料長什麼形狀，也能描述值的範圍。名字最長幾個字、金額不能是負數、
陣列至少要有幾筆，這些標在 TypeSpec 宣告上，會一起輸出到 AsyncAPI 文件裡。

## 對應關係

每個 decorator 對應一個同義的 draft-07 關鍵字。可以標在屬性、model 或 scalar 宣告上。
標在 scalar 上時，用到那個 scalar 的每個欄位都會自動帶著同樣的約束，寫法見
[Scalar](./scalars)。

| TypeSpec decorator                          | Schema 關鍵字                           |
| ------------------------------------------- | --------------------------------------- |
| `@minLength` / `@maxLength`                 | `minLength` / `maxLength`               |
| `@pattern`                                  | `pattern`                               |
| `@format`                                   | `format`                                |
| `@minValue` / `@maxValue`                   | `minimum` / `maximum`                   |
| `@minValueExclusive` / `@maxValueExclusive` | `exclusiveMinimum` / `exclusiveMaximum` |
| `@minItems` / `@maxItems`                   | `minItems` / `maxItems`                 |

## 範例

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

## TypeSpec 未提供 `uniqueItems`

JSON Schema 有 `uniqueItems`，但 TypeSpec 沒有對應的 decorator，無法使用這個約束。

## 兩種會被省略的情況

這兩種情況下，該關鍵字會**以警告省略**：

- 邊界值表示不成 JSON 數字，例如 `int64` 上的 `@maxValue(9223372036854775807)`
- 標在日期、時間或 duration 值上

診斷代碼分別是 [`unrepresentable-numeric-constraint`](../../reference/diagnostics#unrepresentable-numeric-constraint)
與 [`unsupported-temporal-range-constraint`](../../reference/diagnostics#unsupported-temporal-range-constraint)。
