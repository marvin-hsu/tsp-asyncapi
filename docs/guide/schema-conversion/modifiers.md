---
title: "Modifiers"
description: "Documentation text, example values, emitted property names, and the JSON Schema keywords this emitter has no decorator for, all carried into the output by decorators on the declaration."
---

# Modifiers

This page covers how to attach documentation and example values to a model,
a property, or any other declaration, how to emit a property under a name
other than its TypeSpec one, and how to write the JSON Schema keywords this
emitter does not cover.

## Documentation and examples: `@summary`, `@doc`, `@example`

| TypeSpec decorator            | Output field           |
| ----------------------------- | ---------------------- |
| `@summary`                    | `title`                |
| `@doc`, or a `/** */` comment | `description`          |
| `@example`                    | an entry in `examples` |

All three work on models, scalars, enums, unions, properties, and union
variants.

`@example` is repeatable and emits in source order, serialized to plain JSON.
An example the compiler cannot serialize is dropped with the
[`unserializable-example`](../../reference/diagnostics#unserializable-example)
warning.

### Example

```typespec
@summary("Support ticket")
@doc("A ticket opened by a customer.")
@example(#{ id: "T-100", open: true })
model Ticket {
  id: string;
  open: boolean;
}
```

```yaml
Ticket:
  type: object
  properties:
    id:
      type: string
    open:
      type: boolean
  required:
    - id
    - open
  title: Support ticket
  description: A ticket opened by a customer.
  examples:
    - id: T-100
      open: true
```

## Emitting a property under another name: `@encodedName`

A property is emitted under its TypeSpec name by default. `@encodedName`
separates the two: the code says `userName`, the document says `user_name`.

`@discriminator("x")` is the exception. It names the property by its TypeSpec
name, and the emitted `discriminator` value is the renamed one.

### Example

```typespec
model User {
  @encodedName("application/json", "user_name")
  userName: string;
}
```

```yaml
User:
  type: object
  properties:
    user_name:
      type: string
  required:
    - user_name
```

## Keywords with no decorator: `@jsonSchemaExtension`

JSON Schema has more keywords than this emitter gives dedicated decorators
for. Write the missing ones with `@jsonSchemaExtension` as a key/value pair.

It is repeatable, one pair per application, and it wins over any keyword the
emitter would produce itself.

### Example

```typespec
@jsonSchemaExtension("unevaluatedProperties", false)
model Strict {
  id: string;
}
```

```yaml
Strict:
  type: object
  properties:
    id:
      type: string
  required:
    - id
  unevaluatedProperties: false
```
