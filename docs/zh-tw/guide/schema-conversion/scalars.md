---
title: "Scalar"
description: "本頁列出每個內建 scalar 對應的 type 與 format，以及自訂 scalar 怎麼把文件與驗證關鍵字帶到每個使用處。"
---

# Scalar

scalar 是單一個值：字串、數字、布林值、時間。model 有屬性，scalar 沒有。

每個 TypeSpec scalar 對應一個 JSON Schema 的 `type`。JSON Schema 另外有 `format`
可以標示更精確的種類（例如 `int32`、`date-time`），對得上的就一併寫出。

具名 scalar 跟具名 model 一樣：先在 `components.schemas` 定義一次，其他地方用
`$ref` 引用。

## 內建 scalar

| TypeSpec                                 | `type`    | `format`                                 |
| ---------------------------------------- | --------- | ---------------------------------------- |
| `string`                                 | `string`  | —                                        |
| `boolean`                                | `boolean` | —                                        |
| `integer`                                | `integer` | —（抽象型別，寬度未定）                  |
| `numeric`、`float`                       | `number`  | —（抽象型別，寬度未定）                  |
| `int8` / `int16` / `int32` / `int64`     | `integer` | `int8` / `int16` / `int32` / `int64`     |
| `safeint`                                | `integer` | `int64`                                  |
| `uint8` / `uint16` / `uint32` / `uint64` | `integer` | `uint8` / `uint16` / `uint32` / `uint64` |
| `float32`                                | `number`  | `float`                                  |
| `float64`                                | `number`  | `double`                                 |
| `decimal`                                | `number`  | `decimal`                                |
| `decimal128`                             | `number`  | `decimal128`                             |
| `bytes`                                  | `string`  | `byte`                                   |
| `plainDate`                              | `string`  | `date`                                   |
| `plainTime`                              | `string`  | `time`                                   |
| `utcDateTime`、`offsetDateTime`          | `string`  | `date-time`                              |
| `duration`                               | `string`  | `duration`                               |
| `url`                                    | `string`  | `uri`                                    |

Intrinsic 型別：`null` → `{ type: "null" }`；`never` 與 `void` → `{ not: {} }`（任何值都不合法）；`unknown` → `{}`（任何值都合法）。

## 使用者自訂 scalar

用 `extends` 可以從既有的 scalar 衍生新的。形狀沿用基底，再加上自己的文件與驗證關鍵字。規則定義在 scalar 上，每個用到它的欄位都自動帶著：

```typespec
@doc("An RFC 5321 mailbox address.")
@maxLength(254)
scalar Email extends string;

model Account {
  email: Email;
}
```

```yaml
components:
  schemas:
    Email:
      type: string
      description: An RFC 5321 mailbox address.
      maxLength: 254
    Account:
      type: object
      properties:
        email:
          $ref: "#/components/schemas/Email"
      required:
        - email
```

屬性重複宣告 scalar 已經帶了的關鍵字時（例如 scalar 有 `@minLength(5)`，屬性又標 `@minLength(2)`），後者不會覆蓋前者。兩個限制用 `allOf` 疊加，**兩者都要成立**。

::: tip
描述業務概念時特別好用。`Email`、`OrderId`、`Percentage` 這類東西在系統裡到處出現，把規則寫在 scalar 上定義一次，之後每個欄位都會自動帶著同樣的約束，不必逐一標註，也不會有人漏標。改規則時也只要改一個地方。
:::
