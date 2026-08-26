---
title: "Validation"
description: "TypeSpec's validation decorators become the matching JSON Schema draft-07 keywords, carrying the range of a value into the emitted schema."
---

# Validation

A schema describes the shape of a value, and it can describe the range too.
How long a name may be, that an amount is never negative, how few items an
array may hold — mark these on the TypeSpec declaration and they reach the
AsyncAPI document with everything else.

## What maps to what

Each decorator becomes the draft-07 keyword of the same meaning. They target
a property, a model, or a scalar declaration. On a scalar, every field that
uses it carries the constraint — see [Scalar](./scalars).

| TypeSpec decorator                          | Schema keyword                          |
| ------------------------------------------- | --------------------------------------- |
| `@minLength` / `@maxLength`                 | `minLength` / `maxLength`               |
| `@pattern`                                  | `pattern`                               |
| `@format`                                   | `format`                                |
| `@minValue` / `@maxValue`                   | `minimum` / `maximum`                   |
| `@minValueExclusive` / `@maxValueExclusive` | `exclusiveMinimum` / `exclusiveMaximum` |
| `@minItems` / `@maxItems`                   | `minItems` / `maxItems`                 |

## Example

```typespec
model Product {
  @minLength(1) @maxLength(50) name: string;
  @minValue(0) @maxValueExclusive(1000000) price: float64;
  @minItems(1) @maxItems(10) tags: string[];
  @pattern("^[A-Z]{2}-\\d{4}$") sku: string;
  @format("uuid") id: string;
}
```

```yaml
Product:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 50
    price:
      type: number
      format: double
      minimum: 0
      exclusiveMaximum: 1000000
    tags:
      type: array
      items:
        type: string
      minItems: 1
      maxItems: 10
    sku:
      type: string
      pattern: ^[A-Z]{2}-\d{4}$
    id:
      type: string
      format: uuid
  required:
    - name
    - price
    - tags
    - sku
    - id
```

## The keyword with no decorator

Nothing emits `uniqueItems`. `@typespec/compiler` has no decorator for it.

## When a bound cannot be written

Two cases drop the keyword **with a warning** rather than emit a wrong value:

- the bound is not representable as a JSON number, such as
  `@maxValue(9223372036854775807)` on an `int64`
- it targets a date, time, or duration value

The codes are [`unrepresentable-numeric-constraint`](../../reference/diagnostics#unrepresentable-numeric-constraint)
and [`unsupported-temporal-range-constraint`](../../reference/diagnostics#unsupported-temporal-range-constraint).
