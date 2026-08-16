# 02 — Payload schemas

The basic shapes of the schema layer, and the constraints on them. One
message, and every shape reachable from its payload.

Composition is the next example. Inheritance, unions, templates and the
extension escape hatch are in
[03-schema-composition](../03-schema-composition/).

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/02-payload-schemas
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

## Reachability

Only a model that a message payload reaches gets a `components.schemas`
entry. A model that no message reaches is not emitted at all.

Every model in `main.tsp` is reachable from `OrderPlaced`.

A user scalar is the one declaration that never gets an entry of its own. It
is described under "Named entries against inlined shapes" below.

## What each construct emits

| TypeSpec                               | Schema output                                           |
| -------------------------------------- | ------------------------------------------------------- |
| a named model                          | an entry in `components.schemas`                        |
| a property whose type is a named model | a `$ref` to that entry                                  |
| an optional property (`?`)             | the property stays out of `required`                    |
| `T[]`                                  | `type: array` with `items`                              |
| `Record<T>`                            | `type: object` with `additionalProperties`              |
| a union of string literals             | `type: string` with an `enum` array                     |
| `string \| null`                       | `anyOf` with a `type: "null"` branch                    |
| a string-valued enum                   | `type: string` with an `enum` array                     |
| a number-valued enum                   | `type: number` with an `enum` array                     |
| `scalar Email extends string`          | the base shape, plus the scalar's own keywords, inlined |

## Named entries against inlined shapes

A named model and an enum each get their own `components.schemas` entry.
Every use site then holds a `$ref` to it. `Currency` and `Priority` show this
for enums. A named union does the same, and example 03 shows it.

A user scalar does not. The emitter writes the scalar's shape directly into
every property that uses it. There is no `Email` key in the emitted document.
`Customer.email` instead carries `type: string`, the `description` from
`@doc`, and `maxLength: 254`, all written out in place.

So a scalar is a way to reuse a shape in the source, and not a way to reuse
one in the output. Declare a model when you want one named entry that many
properties reference.

## How a schema key is named

The key of a `components.schemas` entry is the declaration name, with the
enclosing namespaces in front of it. The segments are joined with `.`. So
`model Widget` inside `namespace A.B` reaches the document as `A.B.Widget`.

Two namespaces are left out of that prefix. One is the built-in `TypeSpec`
namespace. The other is the service namespace, the one that carries
`@service`. Nearly every declaration in a single-service document sits under
the service namespace, so it tells the reader nothing.

Every model in this example sits directly under `CatalogService`, which is
the service namespace. That is why every key here is a bare name. Example 05
declares a model inside a nested namespace, and its key carries the prefix.

A `components.messages` key is built the same way, minus the namespace
prefix. A message key is therefore always a bare name. A message whose
payload sits in a nested namespace shows the two forms side by side: the
message key stays bare, and the payload `$ref` points at the dotted schema
key.

Example 03 covers the key of a template instantiation.

## Constraints and formats

Each decorator maps to the draft-07 keyword of the same meaning.

| TypeSpec                                    | Schema keyword                          |
| ------------------------------------------- | --------------------------------------- |
| `@minLength` / `@maxLength`                 | `minLength` / `maxLength`               |
| `@pattern`                                  | `pattern`                               |
| `@format`                                   | `format`                                |
| `@minValue` / `@maxValue`                   | `minimum` / `maximum`                   |
| `@minValueExclusive` / `@maxValueExclusive` | `exclusiveMinimum` / `exclusiveMaximum` |
| `@minItems` / `@maxItems`                   | `minItems` / `maxItems`                 |

A constraint on a scalar declaration follows the scalar to every use site.
`Email` carries `maxLength: 254` into `Customer.email`.

## Documentation

`@summary` becomes `title`. `@doc`, or a `/** ... */` doc comment, becomes
`description`. `@example` becomes one entry of the `examples` array,
serialized to plain JSON.

`Money` shows all three. Its `@example` emits as:

```yaml
examples:
  - amount: 1250
    currency: EUR
```

## Wire names

`@encodedName("application/json", "postal_code")` renames the emitted
property key. The TypeSpec name stays `postalCode`. The schema key, and the
entry in `required`, both become `postal_code`.

## Next

Read [03-schema-composition](../03-schema-composition/) for inheritance,
unions, templates and raw JSON Schema keywords.
