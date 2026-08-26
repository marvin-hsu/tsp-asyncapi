---
title: "繼承與多型"
description: "`model B extends A` 轉成 `allOf: [指向 A 的 $ref, B 自己的屬性]`。`@discriminator` 加上 AsyncAPI 3.x 字串形式的 `discriminator`，值是該屬性的 **wire name**："
---

# 繼承與多型

## 繼承與 discriminator

`model B extends A` 轉成 `allOf: [指向 A 的 $ref, B 自己的屬性]`。`@discriminator` 加上 AsyncAPI 3.x 字串形式的 `discriminator`，值是該屬性的 **wire name**：

```typespec
@discriminator("kind")
model OrderEvent {
  kind: string;
  occurredAt: utcDateTime;
}

model OrderCreated extends OrderEvent {
  kind: "order-created";
  orderId: string;
}

model OrderCanceled extends OrderEvent {
  kind: "order-canceled";
  reason?: string;
}
```

```yaml
components:
  schemas:
    OrderEvent:
      type: object
      properties:
        kind:
          type: string
        occurredAt:
          type: string
          format: date-time
      required:
        - kind
        - occurredAt
      discriminator: kind
    OrderCreated:
      allOf:
        - $ref: "#/components/schemas/OrderEvent"
        - type: object
          properties:
            kind:
              type: string
              enum:
                - order-created
            orderId:
              type: string
          required:
            - kind
            - orderId
    OrderCanceled:
      allOf:
        - $ref: "#/components/schemas/OrderEvent"
        - type: object
          properties:
            kind:
              type: string
              enum:
                - order-canceled
            reason:
              type: string
          required:
            - kind
```

emitter 強制兩條規則（違反時各有[診斷](../../reference/diagnostics)）：discriminating 屬性必須定義在該 model 或祖先上，且必須是必填。違反時 `discriminator` 以警告省略，不會輸出壞掉的結果。
