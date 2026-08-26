---
title: "標註與修改"
description: "`@summary` → `title`。`@doc`（或 `/** ... */` 文件註解）→ `description`。`@example` → `examples` 的一個項目，序列化為純 JSON："
---

# 標註與修改

## 文件：`@summary`、`@doc`、`@example`

`@summary` → `title`。`@doc`（或 `/** ... */` 文件註解）→ `description`。`@example` → `examples` 的一個項目，序列化為純 JSON：

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

這三個 decorator 可用在 model、scalar、enum、union、屬性與 union variant。多個 `@example` 依原始碼順序輸出。無法序列化成 JSON 的 example 會被丟棄，並發出 [`unserializable-example`](../../reference/diagnostics#unserializable-example) 警告。

## 改寫 wire key：`@encodedName`

schema 的屬性 key 是 wire name，不是 TypeSpec 名稱：

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

`@discriminator("x")` 仍用 **TypeSpec** 屬性名稱指名。輸出的 `discriminator` 值才是解析後的 wire name。

## 逃生口：`@jsonSchemaExtension`

用於本 emitter 沒有專屬 decorator 的 JSON Schema 關鍵字。可重複套用。每次套用加一組 key/value，且會蓋過 emitter 自己產生的同名關鍵字：

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
