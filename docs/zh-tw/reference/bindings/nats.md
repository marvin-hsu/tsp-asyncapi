# NATS

NATS binding。輸出的成員是 `nats`，每個物件都帶 `bindingVersion: 0.1.0`。

## `@natsOperation`

```typespec
extern dec natsOperation(target: Operation, config: valueof AsyncAPINatsOperationBinding);
```

| 欄位    | 型別     | 必填 |
| ------- | -------- | ---- |
| `queue` | `string` | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`queue` 是訂閱加入的 queue group 名稱。NATS 把每則訊息送給 queue group 裡的一位成員，而不是全部成員。名稱最長 255 個字元。

NATS 沒有定義 server、channel 或 message binding。
