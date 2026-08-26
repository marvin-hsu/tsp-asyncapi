---
title: "Enum"
description: "enum 描述一個欄位只能取的那幾個值。本頁說明成員值怎麼決定，以及 type 何時是 string、何時是 number、何時省略。"
---

# Enum

enum 用來表達「或」：一個欄位只能是列出來的其中一個值。

成員分兩種，一種由數值組成，一種由字面值組成：

```typespec
enum Priority { Low: 0, High: 10 }  // 數值
enum Color { Red, Green, Blue }     // 字面值，沒寫值就用成員名稱
```

輸出是 JSON Schema 的 `enum`，一個把合法值列出來的陣列。跟具名 model 一樣，會在
`components.schemas` 定義一次，其他地方用 `$ref` 引用。

`type` 由值的種類決定：

| 成員的值   | `type`      |
| ---------- | ----------- |
| 全部是字串 | `string`    |
| 全部是數字 | `number`    |
| 兩種混用   | 不寫 `type` |

混用時之所以省略，是因為 JSON Schema 的 `type` 只能指一種。反正 `enum` 那個陣列
本身就把合法值限死了。

## 範例

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
