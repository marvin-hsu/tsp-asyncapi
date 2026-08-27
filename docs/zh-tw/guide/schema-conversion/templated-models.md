---
title: "Templated model"
description: "template 本身不是一份 schema，每個 instantiation 才是。本頁說明每個 instantiation 拿到什麼名稱。"
---

# Templated model

template 是帶參數的 model，寫成 `model Page<T>`。它本身無法成為一份 schema，
必須先由使用者指定 `T` 代表哪個型別。

指定的寫法像是 `Page<string>` 或 `Page<Order>`，這叫做 instantiation。tsp-asyncapi 會把
每一個 instantiation 放進 `components.schemas` 區段。

## instantiation 的名稱

instantiation 預設將 template 名稱加上型別名稱。`Page<string>` 是 `PageString`，
`Page<Order>` 是 `PageOrder`。同一份 template 用兩組不同型別，就是兩個項目。

如果 `T` 有指定的預設型別，使用時不帶參數也是一個 instantiation。
`model Env<T = never>` 寫成 `Env` 使用時，是 `Env<never>` 的 instantiation，
key 為 `EnvNever`。

具名 union 也能帶參數，寫法與 model 相同。它的 instantiation 用同一條規則命名。

### 範例

```typespec
model Page<T> {
  items: T[];
  total: int32;
}

model Env {
  p: Page<string>;
  q: Page<Order>;
}
```

```yaml
components:
  schemas:
    PageString:
      type: object
      properties:
        items:
          type: array
          items:
            type: string
        total:
          type: integer
          format: int32
      required:
        - items
        - total
    PageOrder:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/Order"
        total:
          type: integer
          format: int32
      required:
        - items
        - total
```

## `@friendlyName`

推導出來的名稱不好讀時，用 compiler 內建的 `@friendlyName` 換掉：

```typespec
@friendlyName("{name}Envelope", T)
model Envelope<T> {
  data: T;
}

model Env2 {
  e: Envelope<Order>; // 名稱是 OrderEnvelope
}
```

## 匿名型別

有些型別沒有自己的名字。literal、string template、tuple、value，以及匿名的
model 或 union 都屬於這一類。遇到這種狀況時，整個 instantiation 就無法命名。
其他參數有名字也沒有用。這時 tsp-asyncapi 無法把型別抽出到
`components.schemas`，會直接用 inline 嵌入。

只有一種情況寫不成 inline：model 參照到自己。

```typespec
model Node<T> {
  v: T;
  children: Node<T>[];
}

model M {
  a: Node<{ x: string }>;
}
```

`a` 直接 inline 展開會展不完，因為每展開一層，裡面又出現一個
`Node<{ x: string }>`。所以 tsp-asyncapi 還是會給它一個項目，key 用參數的
完整文字組出來：

```
NodeSep123Sep32XSep58Sep32StringSep32Sep125
```

`components` 的 key 不能有 `{` 或空白，這些字元會換成 `Sep` 加上字元碼。
規則見 [schema key 怎麼決定](../../reference/decorators/schemas#schema-key-怎麼決定)。

## instantiation 重名

instantiation 的名稱跟另一個宣告撞在一起時，回報
[`duplicate-schema-key`](../../reference/diagnostics#duplicate-schema-key)
錯誤。tsp-asyncapi 不會自動改名，要自己用 [`@friendlyName`](#friendlyname)
或改掉其中一個宣告的名稱來避開。
