---
title: "Models"
description: "A model is the unit that describes a payload or a set of headers, and becomes an AsyncAPI Schema Object. This page covers how a named model reaches components.schemas, and how properties, arrays and Record convert."
---

# Models

A model is the unit that describes a payload or a set of headers. A TypeSpec
model becomes an AsyncAPI Schema Object.

There are two kinds of model, and they land in different places.

A **named model** is one declared with `model X { ... }`. The first time
something uses it, it is written into `components.schemas` as an entry of its
own. Every use site, whether a message payload or a property of another model,
points at that entry with `$ref`, which is the form the specification asks
for. The content is never expanded twice.

An **anonymous model** is a `{ ... }` written straight onto a property. It is
expanded where it is used and never reaches `components.schemas`, because it
has no name to key it by. Two anonymous models of the same shape are expanded
separately, since they are two distinct types.

```typespec
model Order {
  shipping: Address;          // named: an entry, then a $ref
  metadata: { note: string }; // anonymous: expanded in place
}
```

The conversion rules:

- An optional property (`?`) stays out of `required`.
- An array becomes `type: array`, with the element type under `items`.

## `Record<T>`, an object with open keys

An ordinary model defines its properties up front. A `Record<T>` does not:
any string is a key, but every value must be of the same type.
The output is a `type: object` whose `additionalProperties` gives the type of
the values. There is no list of property names, because there is none to list.

```typespec
metadata: Record<string>;
```

```yaml
metadata:
  type: object
  additionalProperties:
    type: string
```

If you know the keys, use an ordinary model. Reach for `Record<T>` only when
they are decided at run time, such as user-supplied labels.

## Example

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
