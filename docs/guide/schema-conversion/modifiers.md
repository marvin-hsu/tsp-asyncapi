# Modifiers

## Documentation: `@summary`, `@doc`, `@example`

`@summary` → `title`, `@doc` (or a `/** ... */` doc comment) → `description`, `@example` → an entry in `examples`, serialized to plain JSON:

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

These work on models, scalars, enums, unions, properties, and union variants. Multiple `@example`s emit in source order. An example the compiler cannot serialize to JSON is dropped with the [`unserializable-example`](../../reference/diagnostics#unserializable-example) warning.

## Renaming wire keys: `@encodedName`

The schema's property key is the wire name, not the TypeSpec name:

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

`@discriminator("x")` still names the property by its **TypeSpec** name; the emitted `discriminator` value is the resolved wire name.

## Escape hatch: `@jsonSchemaExtension`

For a JSON Schema keyword this emitter has no dedicated decorator for. Repeatable; each application adds one key/value pair, and it wins over any keyword the emitter would produce itself:

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
