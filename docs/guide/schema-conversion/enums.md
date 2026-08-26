---
title: "Enums"
description: "An enum says a field may only hold one of a few values. This page covers where a member value comes from, and when type is string, number, or absent."
---

# Enums

An enum expresses a choice: a field holds one of the listed values and nothing
else.

Members come in two kinds, numeric and literal:

```typespec
enum Priority { Low: 0, High: 10 }  // numeric
enum Color { Red, Green, Blue }     // literal, the member name is the value
```

The output is a JSON Schema `enum`, an array of the values that are allowed.
Like a named model, it is defined once in `components.schemas` and referenced
with `$ref` everywhere it is used.

The kind of the values decides `type`:

| The member values | `type`   |
| ----------------- | -------- |
| All strings       | `string` |
| All numbers       | `number` |
| A mix of both     | omitted  |

`type` names one kind, so a mix has no `type` to name. The `enum` array is
what pins the allowed values down in any case.

## Example

```typespec
enum Color { Red, Green, Blue }
enum Priority { Low: 0, High: 10 }
enum Mixed { A: "a", B: 2 }
```

```yaml
components:
  schemas:
    Color:
      type: string
      enum:
        - Red
        - Green
        - Blue
    Priority:
      type: number
      enum:
        - 0
        - 10
    Mixed:
      enum:
        - a
        - 2
```
