---
title: "Union"
description: "union 跟 enum 一樣表達「或」，但列的是型別。本頁說明三種 union 各自輸出成 enum、anyOf 或 oneOf。"
---

# Union

union 跟 enum 一樣表達「或」。差別在於 enum 列的是**值**，union 列的是**型別**。

輸出分三種，看 union 的內容而定。

## 只有字串字面值：輸出 `enum`

所有 variant 都是字串字面值時，輸出跟字串 enum 一樣。列出合法值就夠了，不需要分支：

```typespec
model Sub {
  status: "active" | "canceled" | "paused";
}
```

```yaml
Sub:
  type: object
  properties:
    status:
      type: string
      enum:
        - active
        - canceled
        - paused
  required:
    - status
```

## 其他 union：輸出 `anyOf`

其他 union 轉成 `anyOf`，一個 variant 一個分支，符合任何一個分支就算通過。

`T | null` 也是 union，只是其中一個分支是 `null`。JSON Schema draft-07 沒有
`nullable` 這個關鍵字，可為空只能用分支表示：

```typespec
union PaymentMethod {
  card: CreditCard,
  transfer: BankTransfer,
}

model Payment {
  method: PaymentMethod;
  memo: string | null;
}
```

```yaml
PaymentMethod:
  anyOf:
    - $ref: "#/components/schemas/CreditCard"
    - $ref: "#/components/schemas/BankTransfer"
Payment:
  type: object
  properties:
    method:
      $ref: "#/components/schemas/PaymentMethod"
    memo:
      anyOf:
        - type: string
        - type: "null"
  required:
    - method
    - memo
```

## 標上 `@oneOf`：輸出 `oneOf`

`anyOf` 與 `oneOf` 的差別只在**幾個分支可以同時成立**：

| 關鍵字  | 通過條件         | 一筆資料同時符合兩個分支 |
| ------- | ---------------- | ------------------------ |
| `anyOf` | 至少一個分支成立 | 通過                     |
| `oneOf` | 恰好一個分支成立 | 不通過                   |

分支之間形狀差很多時兩者沒有差別，因為一筆資料本來就不可能同時符合。差別出現在
分支重疊的時候。

```typespec
model Circle {
  radius?: float64;
}

model Square {
  side?: float64;
}
```

兩個 model 的欄位都是選填，JSON Schema 預設也允許多餘的屬性，所以
`{ "radius": 1 }` 同時符合 `Circle` 與 `Square`：對 `Circle` 來說 `radius` 對得上，
對 `Square` 來說 `radius` 只是個多餘的屬性，而 `side` 可以不存在。

這筆資料在 `anyOf` 通過（至少符合一個），在 `oneOf` 被擋下（符合了兩個）。

要驗證「必須明確是其中一種」就標上
[`@oneOf`](../../reference/decorators/schemas#oneof)：

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
