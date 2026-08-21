---
title: "Scalars"
description: "| TypeSpec                                 | `type`    | `format`                                 |"
---

# Scalars

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

Intrinsic types: `null` → `{ type: "null" }`; `never` and `void` → `{ not: {} }` (no value is valid); `unknown` → `{}` (any value is valid).

## User-declared scalars

A scalar declared with `extends` inherits the base's shape and layers its own documentation and validation keywords on top. The scalar's constraints follow it to every use site:

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
    Account:
      type: object
      properties:
        email:
          type: string
          description: An RFC 5321 mailbox address.
          maxLength: 254
      required:
        - email
```

If a property re-declares a keyword its scalar already carries (say, `@minLength(2)` on a property whose scalar has `@minLength(5)`), the two constraints are combined with `allOf` so **both** hold — a use site can never silently weaken a scalar's constraint.
