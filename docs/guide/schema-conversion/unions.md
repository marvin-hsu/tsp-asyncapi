---
title: "Unions"
description: "A union of only string literals collapses to a single `enum` — same shape as a string enum:"
---

# Unions

## Unions

A union of only string literals collapses to a single `enum` — same shape as a string enum:

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

Any other union becomes `anyOf`, one branch per variant. `T | null` is just a union with a `null` branch — JSON Schema draft-07 has no `nullable` keyword:

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

To require **exactly one** branch to match instead of "at least one", mark the union with [`@oneOf`](../../reference/decorators/schemas#oneof):

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
