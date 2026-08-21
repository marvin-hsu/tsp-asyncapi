---
title: "Advanced"
description: "An instantiated template gets a stable name derived from its arguments:"
---

# Advanced

## Templates

An instantiated template gets a stable name derived from its arguments:

```typespec
model Page<T> {
  items: T[];
  total: int32;
}

model Uses {
  a: Page<string>;
  b: Page<Order>;
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
      # ... same shape with items: $ref Order
```

To control the name yourself, use the compiler's built-in `@friendlyName`:

```typespec
@friendlyName("{name}Envelope", T)
model Envelope<T> {
  data: T;
}

model Uses2 {
  e: Envelope<Order>; // registered as "OrderEnvelope"
}
```

An instantiation whose argument has no usable identity (an anonymous model, a tuple, ...) is inlined at the use site instead of getting a synthesized name — matching the official TypeSpec emitters' behavior.

## Schema keys and name collisions

The `components.schemas` key for a plain declaration is its declaration name, prefixed by its namespace chain so two same-named models in different namespaces do not collide. (The exact prefix format is still under review while the schema layer is unwired — do not depend on it yet.) A template instantiation's key is composed from the template name and its arguments, as shown above.

Two declarations resolving to the same key (for example via `@friendlyName`, or a model shadowing a template instantiation's derived name) report the [`duplicate-schema-key`](../../reference/diagnostics#duplicate-schema-key) **error**. The emitter never renames either declaration silently.
