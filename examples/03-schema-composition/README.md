# 03 — Schema composition

Four ways to build one schema out of others, plus the raw escape hatch.

Example 02 covers the basic shapes and the constraints on them. Read it
first.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/03-schema-composition
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

## What each construct emits

| TypeSpec                         | Schema output                                     |
| -------------------------------- | ------------------------------------------------- |
| `model B extends A`              | `allOf`, with a `$ref` to `A` as the first branch |
| `@discriminator("kind")`         | `discriminator: kind` on the base schema          |
| a named union                    | `anyOf`, one branch per variant                   |
| `@oneOf` on a named union        | `oneOf` instead of `anyOf`                        |
| an instantiated template         | its own entry, under a composed name              |
| `@friendlyName("{name}Page", T)` | names that entry yourself                         |
| `@jsonSchemaExtension`           | one raw key/value pair in the schema              |

## Inheritance

`model B extends A` emits `allOf`. The first branch is a `$ref` to the base.
The second branch holds the properties the subtype adds.

The base keeps its own entry. `PaymentAuthorized` does not copy the fields of
`PaymentEvent` into itself.

## Discriminated unions

A discriminating property must be defined on the model that carries
`@discriminator`, and it must be required. If either rule is broken, the
emitter leaves `discriminator` out and warns. It never emits a broken one.

`PaymentEvent` emits `discriminator: kind`. Each subtype emits `allOf` with a
`$ref` to the base, and it narrows `kind` to a one-value `enum`.

A subtype does not have to be referenced on its own. Referencing
`PaymentEvent` pulls `PaymentAuthorized` and `PaymentDeclined` in with it.
That is the one exception to the reachability rule of example 02.

## `oneOf` against `anyOf`

A named union emits `anyOf`. That means "at least one branch matches". Mark
the union with `@oneOf` when the variants exclude each other. `Fulfilment` is
either a pickup or a delivery, never both, so it carries `@oneOf`.

Each variant keeps its own `components.schemas` entry. The union entry holds
only the list of `$ref`s.

## Templates

Each instantiation of a template gets its own entry. The key is composed from
the template name and the argument names, so `Page<OrderLine>` and
`Page<Money>` never collide.

`@friendlyName` replaces that composed key with one you write.
`@friendlyName("{name}Page", T)` on `Page<T>` makes `Page<OrderLine>` reach
`components.schemas` as `OrderLinePage`.

## The escape hatch

`@jsonSchemaExtension` writes one raw key/value pair into a model's or a
property's own schema. Use it for a keyword this emitter has no decorator
for. It is repeatable. Each application adds one pair, and it wins over a
keyword the emitter would produce itself.

`DeliveryNote` uses it twice, for `unevaluatedProperties` and `$comment`.

## Next

Read [04-message-metadata](../04-message-metadata/) for everything that sits
around a payload.
