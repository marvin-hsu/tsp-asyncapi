---
title: "Scalars"
description: "This page lists the type and format every built-in scalar maps to, and how a user-defined one carries its documentation and validation to each use site."
---

# Scalars

A scalar is a single value: a string, a number, a boolean, a moment in time.
A model has properties; a scalar does not.

Every TypeSpec scalar maps to a JSON Schema `type`. Where JSON Schema also has
a `format` for the finer kind, such as `int32` or `date-time`, that is written
too.

A named scalar behaves like a named model: it becomes an entry in
`components.schemas`, and every use site points at it with `$ref`.

## Built-in scalars

| TypeSpec                                 | `type`    | `format`                                 |
| ---------------------------------------- | --------- | ---------------------------------------- |
| `string`                                 | `string`  | —                                        |
| `boolean`                                | `boolean` | —                                        |
| `integer`                                | `integer` | — (abstract, width unspecified)          |
| `numeric`, `float`                       | `number`  | — (abstract, width unspecified)          |
| `int8` / `int16` / `int32` / `int64`     | `integer` | `int8` / `int16` / `int32` / `int64`     |
| `safeint`                                | `integer` | `int64`                                  |
| `uint8` / `uint16` / `uint32` / `uint64` | `integer` | `uint8` / `uint16` / `uint32` / `uint64` |
| `float32`                                | `number`  | `float`                                  |
| `float64`                                | `number`  | `double`                                 |
| `decimal`                                | `number`  | `decimal`                                |
| `decimal128`                             | `number`  | `decimal128`                             |
| `bytes`                                  | `string`  | `byte`                                   |
| `plainDate`                              | `string`  | `date`                                   |
| `plainTime`                              | `string`  | `time`                                   |
| `utcDateTime`, `offsetDateTime`          | `string`  | `date-time`                              |
| `duration`                               | `string`  | `duration`                               |
| `url`                                    | `string`  | `uri`                                    |

Intrinsic types:

| TypeSpec        | Output             | Meaning            |
| --------------- | ------------------ | ------------------ |
| `null`          | `{ type: "null" }` |                    |
| `never`, `void` | `{ not: {} }`      | No value is valid  |
| `unknown`       | `{}`               | Any value is valid |

## User-declared scalars

`extends` derives a new scalar from an existing one. The shape comes from the base, and the new scalar adds its own documentation and validation keywords. The rules live on the scalar, so every field that uses it carries them:

```typespec
@doc("An RFC 5321 mailbox address.")
@maxLength(254)
scalar Email extends string;

model Account {
  email: Email;
}
```

```yaml
components:
  schemas:
    Email:
      type: string
      description: An RFC 5321 mailbox address.
      maxLength: 254
    Account:
      type: object
      properties:
        email:
          $ref: "#/components/schemas/Email"
      required:
        - email
```

If a property re-declares a keyword its scalar already carries (say, `@minLength(2)` on a property whose scalar has `@minLength(5)`), the property does not override the scalar. The two constraints are combined with `allOf`, so **both** hold.

::: tip
This is where a scalar earns its keep for a business concept. Something like `Email`, `OrderId` or `Percentage` turns up all over a system. Write the rule on the scalar once and every field that uses it carries the same constraint, with nothing to annotate field by field and nothing for anyone to forget. Changing the rule is one edit.
:::
