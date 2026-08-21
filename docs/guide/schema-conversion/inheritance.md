---
title: "Inheritance"
description: "`model B extends A` becomes `allOf: [$ref to A, B's own properties]`. `@discriminator` adds AsyncAPI 3.x's string-form `discriminator` naming the p..."
---

# Inheritance

## Inheritance and discriminators

`model B extends A` becomes `allOf: [$ref to A, B's own properties]`. `@discriminator` adds AsyncAPI 3.x's string-form `discriminator` naming the property's **wire name**:

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

Two rules the emitter enforces (each with a [diagnostic](../../reference/diagnostics) when violated): the discriminating property must be defined on the model (or an ancestor), and it must be required. Otherwise `discriminator` is omitted with a warning rather than emitted broken.
