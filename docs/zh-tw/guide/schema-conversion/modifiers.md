---
title: "說明、命名與其他"
description: "說明文字、範例值、輸出時的屬性名稱，以及 emitter 沒有涵蓋的 JSON Schema 關鍵字，都靠標在宣告上的 decorator 帶進輸出。"
---

# 說明、命名與其他

本頁說明怎麼在 model、屬性等各種元件上加說明文字與範例值，怎麼讓輸出的屬性名稱與
TypeSpec 的名稱不同，以及怎麼補上 emitter 沒有涵蓋的 JSON Schema 關鍵字。

## 說明與範例：`@summary`、`@doc`、`@example`

| TypeSpec decorator          | 輸出欄位              |
| --------------------------- | --------------------- |
| `@summary`                  | `title`               |
| `@doc` 或 `/** */` 文件註解 | `description`         |
| `@example`                  | `examples` 的一個項目 |

三個都能標在 model、scalar、enum、union、屬性與 union variant 上。

`@example` 可以標多個，依原始碼順序輸出，值序列化成純 JSON。序列化不了的會被丟棄，
並回報 [`unserializable-example`](../../reference/diagnostics#unserializable-example) 警告。

### 範例

```typespec
@summary("Support ticket")
@doc("A ticket opened by a customer.")
@example(#{ id: "T-100", open: true })
model Ticket {
  id: string;
  open: boolean;
}
```

```yaml
Ticket:
  type: object
  properties:
    id:
      type: string
    open:
      type: boolean
  required:
    - id
    - open
  title: Support ticket
  description: A ticket opened by a customer.
  examples:
    - id: T-100
      open: true
```

## 輸出時換一個屬性名稱：`@encodedName`

輸出的屬性名稱預設跟 TypeSpec 的屬性名稱一樣。`@encodedName` 讓兩邊分開：程式碼裡
寫 `userName`，輸出的文件裡是 `user_name`。

`@discriminator("x")` 是例外，指名時用的還是 TypeSpec 名稱，輸出的 `discriminator`
值才是改名後的名稱。

### 範例

```typespec
model User {
  @encodedName("application/json", "user_name")
  userName: string;
}
```

```yaml
User:
  type: object
  properties:
    user_name:
      type: string
  required:
    - user_name
```

## 補上沒有 decorator 的關鍵字：`@jsonSchemaExtension`

JSON Schema 的關鍵字很多，這個 emitter 沒有每個都給專屬 decorator。缺的那些用
`@jsonSchemaExtension` 直接寫一組 key/value 進去。

可以重複標，一次加一組。同名時它蓋過 emitter 自己算出來的值。

### 範例

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
