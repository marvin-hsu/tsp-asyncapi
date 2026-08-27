---
title: "Inheritance"
description: "One message often has several shapes that share some properties. This page covers how extends becomes allOf, and how @discriminator tells a reader which shape it holds."
---

# Inheritance

One message often has several shapes that share some of their properties.
`extends` factors the shared part out, and `@discriminator` tells a reader
which property to look at to know which shape they have.

The two are independent. Use `extends` on its own to share properties.

## `extends`: the shared properties, defined once

`model B extends A` becomes an `allOf` of two branches: a `$ref` to `A`, then
the properties `B` adds. `A` is defined once and every subtype references it.

### Example

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

## `@discriminator`: the property that tells them apart

Reach for this when several subtypes can arrive in the same place and the
reader has to work out which one it holds. Bind each subtype to its own
channel and there is nothing to work out.

Mark the parent model with `@discriminator("kind")` and the output carries
AsyncAPI 3.x's string-form `discriminator: kind`.

The value is the property's **wire name**. Rename it with `@encodedName` and
the `discriminator` follows.

### Example

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

## Two rules

The discriminating property must be:

- defined on the model or one of its ancestors
- required

Break either and `discriminator` is omitted with a warning rather than emitted
broken. The [diagnostics reference](../../reference/diagnostics) has the code
for each.
