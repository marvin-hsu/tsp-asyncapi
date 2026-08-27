---
title: "Amazon SQS"
description: "Amazon SQS binding。輸出的成員是 `sqs`，每個物件都帶 `bindingVersion: 0.2.0`。"
---

# Amazon SQS

Amazon SQS binding。輸出的成員是 `sqs`，每個物件都帶 `bindingVersion: 0.2.0`。

## `@sqsChannel`

```typespec
extern dec sqsChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPISqsChannelBinding
);
```

| 欄位              | 型別               | 必填   |
| ----------------- | ------------------ | ------ |
| `queue`           | `AsyncAPISqsQueue` | **是** |
| `deadLetterQueue` | `AsyncAPISqsQueue` | 否     |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

`queue` 是必填，在這一層它自己又要求 `name` 與 `fifoQueue`。缺這些時，binding 會透過 `missing-binding-field` 回報並整個丟棄。

`deadLetterQueue` 是選填，形狀相同。寫了卻缺它自己的必填欄位時，binding 會透過 `missing-binding-field` 回報並整個丟棄。

`deduplicationScope` 是 `queue` 或 `messageGroup`。`fifoThroughputLimit` 是 `perQueue` 或 `perMessageGroupId`。四個時間欄位都是秒數，是零或以上。

```typespec
@sqsChannel(#{
  queue: #{ name: "orders", fifoQueue: false },
  deadLetterQueue: #{ name: "orders-dlq", fifoQueue: false }
})
@channel("orders-queue")
interface OrderChannel {}
```

```yaml
channels:
  orders-queue:
    address: orders-queue
    bindings:
      sqs:
        queue:
          name: orders
          fifoQueue: false
        deadLetterQueue:
          name: orders-dlq
          fifoQueue: false
        bindingVersion: 0.2.0
```

## `@sqsOperation`

```typespec
extern dec sqsOperation(target: Operation, config: valueof AsyncAPISqsOperationBinding);
```

| 欄位     | 型別                 | 必填   |
| -------- | -------------------- | ------ |
| `queues` | `AsyncAPISqsQueue[]` | **是** |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`queues` 是必填，每一筆都要求 `name`。任何一筆缺 `name` 時，binding 會透過 `missing-binding-field` 回報並整個丟棄。清單本身是空的時，會回報成缺少 `queues`，因為空清單沒有指名任何 queue。

```typespec
@send
@sqsOperation(#{ queues: #[#{ name: "orders" }] })
op publish(event: OrderCreated): void;
```

```yaml
operations:
  publish:
    action: send
    channel:
      $ref: "#/channels/orders-queue"
    bindings:
      sqs:
        queues:
          - name: orders
        bindingVersion: 0.2.0
```
