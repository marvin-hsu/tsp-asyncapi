---
title: "Schemas"
description: "Marks a union to emit `oneOf` (exactly one variant must match) instead of the default `anyOf` (at least one). Takes effect in the [schema conversio..."
---

# Schemas

## `@oneOf`

```typespec
extern dec oneOf(target: Union);
```

Marks a union to emit `oneOf` (exactly one variant must match) instead of the default `anyOf` (at least one). Takes effect in the [schema conversion layer](../../guide/schema-conversion/unions):

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

## `@jsonSchemaExtension`

```typespec
extern dec jsonSchemaExtension(target: Model | ModelProperty, key: valueof string, value: valueof unknown);
```

Adds one raw key/value pair to the target's emitted schema — the escape hatch for keywords with no dedicated decorator. Repeatable: each application adds one pair. An extension key overrides the same keyword the emitter would produce itself.

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

## How a schema key is built

Every named model, enum, and union that a message reaches gets one entry in `components.schemas`. Its key is decided in this order:

1. A `@friendlyName` wins outright. The resolved text is the whole key. No namespace prefix is added.
2. Without one, the key is the declaration name, qualified by its namespace chain. The segments are joined with `.`. For example, `model WithdrawCompleted` inside `namespace Contracts.TransactionHistory` gets the key `Contracts.TransactionHistory.WithdrawCompleted`.

The service namespace and the compiler's built-in `TypeSpec` namespace are dropped from the chain. Nearly every declaration in a single-service spec lives under the service namespace, so that segment carries no distinguishing information. `@typespec/openapi3` drops it the same way.

A declaration in a library namespace outside the service namespace keeps that namespace as its prefix. Apply `@friendlyName` to shorten such a key.

Keys in `components.messages` follow the same rules, with two differences. A message key never carries a namespace prefix. And the argument of [`@message`](./messages#message) overrides a message key the way `@friendlyName` overrides a schema key.

### Key sanitization

A Components Object key must match `^[a-zA-Z0-9.\-_]+$`. AsyncAPI allows no other character in a member name.

A plain TypeSpec identifier already lies inside that charset. It becomes the key unchanged, case included. A `@friendlyName` text or a backtick-quoted name can carry other characters, and the emitter rewrites those:

- `.`, `-`, and `_` stay as they are.
- The first letter of each alphanumeric segment is upper-cased.
- Every other character becomes `Sep` followed by its code point. For example, `has space` becomes `HasSep32Space`.

The rewrite of a schema key is silent. The rewrite of a message key reports [`sanitized-message-key`](../diagnostics#sanitized-message-key). Keep every `@friendlyName` and `@message` argument inside the charset, and no rewrite ever happens.

## Built-in decorators the emitter reads

These come from `@typespec/compiler` — no import needed:

| Decorator                                                                                                                                         | Effect in this emitter                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@service(#{ title })`                                                                                                                            | Marks the service namespace; `title` → `info.title`. One service per document — a second one warns ([`multiple-services`](../diagnostics#multiple-services)) and is ignored.          |
| `@tag("name")`                                                                                                                                    | One `info.tags` entry per application. It cannot target a `Model`, so a message is tagged with [`@asyncTag`](./document-info#asynctag) instead. The two merge when they name one tag. |
| `@doc` / doc comments                                                                                                                             | `description` — on the namespace (fallback for `info.description`) and on every schema-layer declaration or property.                                                                 |
| `@summary`                                                                                                                                        | `title` on a schema.                                                                                                                                                                  |
| `@example(#{...})`                                                                                                                                | An entry in a schema's `examples`, serialized to JSON.                                                                                                                                |
| `@discriminator("prop")`                                                                                                                          | `discriminator` on the schema; see [inheritance](../../guide/schema-conversion/inheritance).                                                                                          |
| `@encodedName("application/json", "wire_name")`                                                                                                   | Renames the schema property key; see [wire keys](../../guide/schema-conversion/modifiers).                                                                                            |
| `@friendlyName("{name}X", T)`                                                                                                                     | Overrides a declaration's `components.schemas` key.                                                                                                                                   |
| `@minLength`, `@maxLength`, `@pattern`, `@format`, `@minValue`, `@maxValue`, `@minValueExclusive`, `@maxValueExclusive`, `@minItems`, `@maxItems` | Validation keywords; see the [mapping table](../../guide/schema-conversion/validation).                                                                                               |

::: tip
Schema-layer decorators (`@oneOf`, `@jsonSchemaExtension`, and the schema-shaping built-ins) currently take effect in the conversion layer only — see the status note in [Schema Conversion](../../guide/schema-conversion/).
:::
