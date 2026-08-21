---
title: "Validation"
description: "Each maps to the draft-07 keyword of the same meaning. They may target a property, a model, or a scalar declaration:"
---

# Validation

## Validation decorators

Each maps to the draft-07 keyword of the same meaning. They may target a property, a model, or a scalar declaration:

| TypeSpec decorator                          | Schema keyword                          |
| ------------------------------------------- | --------------------------------------- |
| `@minLength` / `@maxLength`                 | `minLength` / `maxLength`               |
| `@pattern`                                  | `pattern`                               |
| `@format`                                   | `format`                                |
| `@minValue` / `@maxValue`                   | `minimum` / `maximum`                   |
| `@minValueExclusive` / `@maxValueExclusive` | `exclusiveMinimum` / `exclusiveMaximum` |
| `@minItems` / `@maxItems`                   | `minItems` / `maxItems`                 |

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

There is no `uniqueItems` output — `@typespec/compiler` has no decorator for it.

A bound whose value cannot be represented as a JSON number (e.g. `@maxValue(9223372036854775807)` on an `int64`), or that targets a date/time/duration value, is **omitted with a warning** instead of being emitted wrong — see [`unrepresentable-numeric-constraint`](../../reference/diagnostics#unrepresentable-numeric-constraint) and [`unsupported-temporal-range-constraint`](../../reference/diagnostics#unsupported-temporal-range-constraint).
