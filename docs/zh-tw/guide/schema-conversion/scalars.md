---
title: "Scalar (純量型別)"
description: "| TypeSpec                                 | `type`    | `format`                                 |"
---

# Scalar (純量型別)

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

以 `extends` 宣告的 scalar 繼承基底的形狀，再疊上自己的文件與驗證關鍵字。scalar 的限制會跟著它到每個使用處：

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
    Account:
      type: object
      properties:
        email:
          type: string
          description: An RFC 5321 mailbox address.
          maxLength: 254
      required:
        - email
```

若屬性重複宣告了 scalar 已帶的關鍵字（例如 scalar 有 `@minLength(5)`，屬性又標 `@minLength(2)`），兩個限制會以 `allOf` 疊加，**兩者都要成立**。使用處不能靜默弱化 scalar 的限制。
