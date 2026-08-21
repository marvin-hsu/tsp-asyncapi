---
title: "Model (模型與屬性)"
description: "具名 model 成為 `components.schemas` 的一個項目。使用處以 `$ref` 引用它。選填屬性（`?`）不進 `required`。array 轉成 `type: array`。`Record<T>` 轉成帶 `additionalProperties` 的 `type..."
---

# Model (模型與屬性)

## Model

具名 model 成為 `components.schemas` 的一個項目。使用處以 `$ref` 引用它。選填屬性（`?`）不進 `required`。array 轉成 `type: array`。`Record<T>` 轉成帶 `additionalProperties` 的 `type: object`。

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
