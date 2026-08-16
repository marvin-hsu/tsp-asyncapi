# Union (聯集)

## Union

只有字串字面值的 union 收斂成單一 `enum`，形狀與字串 enum 相同：

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

其他 union 轉成 `anyOf`，一個 variant 一個分支。`T | null` 就是帶 `null` 分支的 union。JSON Schema draft-07 沒有 `nullable` 關鍵字：

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

若要**恰好一個**分支成立（而非「至少一個」），在 union 標 [`@oneOf`](../../reference/decorators/schemas#oneof)：

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
