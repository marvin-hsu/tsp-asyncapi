---
title: "Model"
description: "model 是描述 payload 與 header 的基本單位，對應 AsyncAPI 的 Schema Object。本頁說明具名 model 怎麼進 components.schemas，以及屬性、array、Record 的轉換規則。"
---

# Model

model 是描述 payload 與 header 的基本單位。TypeSpec 的 model 對應 AsyncAPI 的
Schema Object。

model 分兩種，輸出的位置不同。

**具名 model** 是用 `model X { ... }` 宣告、有名字的那種。它第一次被用到時會寫進
`components.schemas`，成為一個獨立項目。message 的 payload、其他 model 的屬性，
只要用到它，就依 AsyncAPI 規格以 `$ref` 指向那個項目，不會把內容重複展開。

**匿名 model** 是直接寫在屬性上的 `{ ... }`，沒有名字。它就地展開在用到的位置，
不會進 `components.schemas`，沒有名字就沒有 key 可以放。兩個地方寫出同樣形狀的
匿名 model 也是各自展開一次，因為它們是兩個不同的型別。

```typespec
model Order {
  shipping: Address;        // 具名，寫進 components.schemas 再 $ref
  metadata: { note: string }; // 匿名，就地展開
}
```

轉換規則：

- 選填屬性（`?`）不列入 `required`。
- array 轉成 `type: array`，元素型別放在 `items`。

## `Record<T>`：key 不固定的物件

一般 model 的屬性是先定義好的，`Record<T>` 不是：key 可以是任何字串，但值必須是
相同的型別。輸出是一個 `type: object`。列不出屬性名稱，就只用 `additionalProperties` 說明每個
值的型別。

```typespec
metadata: Record<string>;
```

```yaml
metadata:
  type: object
  additionalProperties:
    type: string
```

如果已經明確知道 key 就應該用一般的 model，key 是動態的（例如使用者自訂的標籤）
才用 `Record<T>`。

## 範例

```typespec
model Order {
  id: string;
  amount: float64;
  items: OrderItem[];
  metadata: Record<string>;
  note?: string;
}

model OrderItem {
  productId: string;
  quantity: int32;
}
```

```yaml
components:
  schemas:
    OrderItem:
      type: object
      properties:
        productId:
          type: string
        quantity:
          type: integer
          format: int32
      required:
        - productId
        - quantity
    Order:
      type: object
      properties:
        id:
          type: string
        amount:
          type: number
          format: double
        items:
          type: array
          items:
            $ref: "#/components/schemas/OrderItem"
        metadata:
          type: object
          additionalProperties:
            type: string
        note:
          type: string
      required:
        - id
        - amount
        - items
        - metadata
```
