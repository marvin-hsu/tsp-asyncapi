---
title: "Unions"
description: "A union expresses a choice the way an enum does, but over types rather than values. This page covers the three unions and their output: enum, anyOf and oneOf."
---

# Unions

A union expresses a choice the way an enum does. The difference is what it
lists: an enum lists **values**, a union lists **types**.

There are three outputs, depending on what the union holds.

## Only string literals: an `enum`

When every variant is a string literal, the output matches a string enum.
Listing the allowed values says everything; branches would add nothing:

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

## Any other union: `anyOf`

Every other union becomes `anyOf`, one branch per variant. A value passes when
it matches any branch.

`T | null` is a union too, with `null` as one of the branches. JSON Schema
draft-07 has no `nullable` keyword, so a branch is the only way to say it:

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

## `@oneOf`: exactly one

`anyOf` and `oneOf` differ on one point: **how many branches may match at
once**.

| Keyword | Passes when                 | A value matching two branches |
| ------- | --------------------------- | ----------------------------- |
| `anyOf` | At least one branch matches | Passes                        |
| `oneOf` | Exactly one branch matches  | Fails                         |

When the branches have nothing in common the two behave alike, because no
value can match twice. The difference shows up when branches overlap.

```typespec
model Circle {
  radius?: float64;
}

model Square {
  side?: float64;
}
```

Every property of both is optional, and JSON Schema allows extra properties by
default, so `{ "radius": 1 }` matches both. `Circle` recognises `radius`, and
`Square` treats it as an extra property while `side` is allowed to be absent.

That value passes `anyOf`, which asked for at least one branch, and fails
`oneOf`, which asked for exactly one.

Mark the union with [`@oneOf`](../../reference/decorators/schemas#oneof) to
require that a value is unambiguously one of them:

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
