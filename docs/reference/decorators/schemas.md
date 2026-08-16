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
