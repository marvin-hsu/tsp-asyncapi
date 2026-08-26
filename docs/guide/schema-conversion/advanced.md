---
title: "Templates and name collisions"
description: "Each instantiation of a templated model is a schema of its own. This page covers where those names come from, and what happens when two declarations arrive at the same one."
---

# Templates and name collisions

Each instantiation of a templated model is its own entry under
`components.schemas`. This page covers where those names come from, and what
happens when two declarations arrive at the same one.

## The name of an instantiation

The name is the template's name followed by its arguments. `Page<string>` is
`PageString`, `Page<Order>` is `PageOrder`. One template with two arguments is
two entries.

### Example

```typespec
model Page<T> {
  items: T[];
  total: int32;
}

model Env {
  p: Page<string>;
  q: Page<Order>;
}
```

```yaml
components:
  schemas:
    PageString:
      type: object
      properties:
        items:
          type: array
          items:
            type: string
        total:
          type: integer
          format: int32
      required:
        - items
        - total
    PageOrder:
      type: object
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/Order"
        total:
          type: integer
          format: int32
      required:
        - items
        - total
```

## Choosing the name yourself

When the derived name reads badly, replace it with the compiler's built-in
`@friendlyName`:

```typespec
@friendlyName("{name}Envelope", T)
model Envelope<T> {
  data: T;
}

model Env2 {
  e: Envelope<Order>; // named OrderEnvelope
}
```

## Arguments with no name

When an argument has no name of its own (an anonymous model, a tuple), the
emitter does not invent one. The type is inlined where it is used, which is
what the official TypeSpec emitters do.

## Schema keys and name collisions

A plain declaration's key is its name prefixed by its namespace chain.
`Thing` in `namespace Alpha` is `Alpha.Thing` and `Thing` in `namespace Beta`
is `Beta.Thing`, so neither shadows the other. The namespace holding
`@service` is left out, which makes the key read like the official emitters'
full type name.

Two declarations arriving at one key report the
[`duplicate-schema-key`](../../reference/diagnostics#duplicate-schema-key)
**error**. The two common ways in are a `@friendlyName` pointing at a name
already taken, and a model named exactly what some instantiation derives.

The emitter renames neither of them. Which one gives way is yours to decide.
