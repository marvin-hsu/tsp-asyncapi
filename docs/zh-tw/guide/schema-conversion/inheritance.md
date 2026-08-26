---
title: "繼承與多型"
description: "一則 message 常有好幾種形態，共用一部分欄位。本頁說明 extends 怎麼輸出成 allOf，以及 @discriminator 怎麼讓讀取端分辨型別。"
---

# 繼承與多型

一則 message 常有好幾種形態，彼此共用一部分欄位。`extends` 把共用的部分抽出來，
`@discriminator` 告訴讀取端該看哪個欄位分辨是哪一種。

兩者分開用。只想共用欄位的話，`extends` 單獨用就好。

## `extends`：共用的欄位定義一次

`model B extends A` 輸出成 `allOf`，兩個分支：第一個是指向 `A` 的 `$ref`，第二個是
`B` 自己多出來的屬性。`A` 只定義一次，每個子型別引用它。

### 範例

```typespec
model AuditFields {
  occurredAt: utcDateTime;
  actor: string;
}

@message
model PaymentCaptured extends AuditFields {
  paymentId: string;
  amount: int32;
}
```

```yaml
components:
  schemas:
    AuditFields:
      type: object
      properties:
        occurredAt:
          type: string
          format: date-time
        actor:
          type: string
      required:
        - occurredAt
        - actor
    PaymentCaptured:
      allOf:
        - $ref: "#/components/schemas/AuditFields"
        - type: object
          properties:
            paymentId:
              type: string
            amount:
              type: integer
              format: int32
          required:
            - paymentId
            - amount
```

## `@discriminator`：靠哪個欄位分辨

多個子型別出現在同一個位置時才需要它。讀取端拿到一筆資料，得自己判斷是哪一種，
`@discriminator` 就是告訴它看哪個欄位。

每個子型別各自綁在自己的 channel 上時不需要。收到的是哪一種由 channel 決定，
不用猜。

在父 model 標上 `@discriminator("kind")`，輸出就會帶上 AsyncAPI 3.x 的字串形式
`discriminator: kind`。

值用的是那個屬性的 **wire name**。用 `@encodedName` 改過名字時，`discriminator`
跟著改。

### 範例

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

## 兩條限制

用來分辨的那個屬性必須：

- 定義在該 model 或它的父層上
- 是必填

違反任一條時，`discriminator` 會以警告省略，不會輸出壞掉的結果。各自對應的代碼見
[診斷訊息](../../reference/diagnostics)。
