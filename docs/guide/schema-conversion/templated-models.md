---
title: "Templated models"
description: "A template is not a schema of its own. Each instantiation is one, and this page covers the name each instantiation gets."
---

# Templated models

A template is a model with parameters, written `model Page<T>`. It cannot be
a schema on its own. The author must first say what type `T` stands for.

The author says it by writing `Page<string>` or `Page<Order>`. Each of these is
called an instantiation. The emitter puts every instantiation into
`components.schemas`.

## The name of an instantiation

By default, an instantiation is named after the template, followed by the name
of each type. `Page<string>` is `PageString`, and `Page<Order>` is `PageOrder`.
The same template used with two different types gives two entries.

If `T` has a default type, a use site with no argument is still an
instantiation. `model Env<T = never>` used as `Env` is an instantiation of
`Env<never>`, and its key is `EnvNever`.

A named union takes parameters the same way a model does. An instantiation of
one is named by this same rule.

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

## `@friendlyName`

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

## Anonymous types

Some types have no name of their own. A literal, a string template, a tuple, a
value, and an anonymous model or union are all of this kind. In this case, the
emitter cannot name the whole instantiation. Names on the other arguments do
not help. The emitter then cannot lift the type into `components.schemas`. It
writes the type inline where it is used.

One case cannot be written inline: a model that refers to itself.

```typespec
model Node<T> {
  v: T;
  children: Node<T>[];
}

model M {
  a: Node<{ x: string }>;
}
```

Expanding `a` inline would never finish. Every expansion leaves another
`Node<{ x: string }>` inside it. So the emitter gives the type an entry after
all, and keys it by the full text of the argument:

```
NodeSep123Sep32XSep58Sep32StringSep32Sep125
```

A `components` key cannot hold `{` or a space, so each of them becomes `Sep`
and a character code. See
[How a schema key is built](../../reference/decorators/schemas#how-a-schema-key-is-built).

## Instantiation name collisions

When an instantiation name collides with another declaration, the emitter
reports the
[`duplicate-schema-key`](../../reference/diagnostics#duplicate-schema-key)
error. It renames neither of them. Apply [`@friendlyName`](#friendlyname), or
rename one of the two declarations, to avoid the collision.
