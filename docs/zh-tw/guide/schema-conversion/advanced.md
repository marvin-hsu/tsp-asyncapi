---
title: "Template 與名稱衝突"
description: "model 寫成 template 時，每個具現化都是獨立的一份 schema。本頁說明這些 schema 的名稱怎麼決定，以及兩個宣告算到同一個名稱時會怎麼樣。"
---

# Template 與名稱衝突

model 寫成 template 時，每個具現化都是 `components.schemas` 裡獨立的一份 schema。
本頁說明這些名稱怎麼決定，以及兩個宣告算到同一個名稱時會怎麼樣。

## 具現化的名稱

名稱是 template 名稱接上參數名稱。`Page<string>` 是 `PageString`，`Page<Order>` 是
`PageOrder`。同一份 template 用不同參數，就是兩個不同的項目。

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

## 自己指定名稱

推導出來的名字不好讀時，用 compiler 內建的 `@friendlyName` 換掉：

```typespec
@friendlyName("{name}Envelope", T)
model Envelope<T> {
  data: T;
}

model Env2 {
  e: Envelope<Order>; // 名稱是 OrderEnvelope
}
```

## 參數沒有名字的時候

參數本身沒有名字時（匿名 model、tuple 這些），emitter 不會硬湊一個名稱，而是把型別
直接內聯在用到它的地方。TypeSpec 官方的 emitter 也是這樣做。

## Schema key 與名稱衝突

一般宣告的 key 是宣告名稱，前面接上 namespace 鏈。`namespace Alpha` 裡的 `Thing`
是 `Alpha.Thing`，`namespace Beta` 裡的同名 model 是 `Beta.Thing`，兩者不會互相蓋掉。
`@service` 所在的那層 namespace 不算在內，寫法與官方 emitter 的型別全名一致。

兩個宣告算到同一個 key 時，回報 [`duplicate-schema-key`](../../reference/diagnostics#duplicate-schema-key)
**錯誤**。常見的兩種是 `@friendlyName` 指定到已經有人用的名字，以及某個 model 的名稱
剛好等於某個具現化推導出來的名稱。

emitter 不會自動改名，必須自己改掉其中一個。
