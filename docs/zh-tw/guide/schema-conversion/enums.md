---
title: "Enum"
description: "成員值取自明確給定的值（`Low: 0`），沒給就用成員名稱。全部是字串時 `type` 為 `string`。全部是數字時為 `number`。混用時省略 `type`："
---

# Enum

## Enum

成員值取自明確給定的值（`Low: 0`），沒給就用成員名稱。全部是字串時 `type` 為 `string`。全部是數字時為 `number`。混用時省略 `type`：

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
