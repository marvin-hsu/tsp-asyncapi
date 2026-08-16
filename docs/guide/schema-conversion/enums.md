# Enums

## Enums

Member values come from the explicit value (`Low: 0`) or fall back to the member name. `type` is `string` when all values are strings, `number` when all are numbers, and omitted for a mix:

```typespec
enum Color { Red, Green, Blue }
enum Priority { Low: 0, High: 10 }
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
```
