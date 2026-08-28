---
title: "Amazon SQS"
description: "The Amazon SQS binding. The emitted member is `sqs`, and every object carries `bindingVersion: 0.2.0`."
---

# Amazon SQS

The Amazon SQS binding. The emitted member is `sqs`, and every object carries `bindingVersion: 0.2.0`.

## `@sqsChannel`

```typespec
extern dec sqsChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPISqsChannelBinding
);
```

| Field             | Type               | Required |
| ----------------- | ------------------ | -------- |
| `queue`           | `AsyncAPISqsQueue` | **yes**  |
| `deadLetterQueue` | `AsyncAPISqsQueue` | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

`queue` is required, and on this level it requires a `name` and a `fifoQueue` of its own. A binding without them is reported through `missing-binding-field` and dropped whole.

`deadLetterQueue` is optional and has the same shape. One that is written without a required field of its own is reported through `missing-binding-field` and dropped whole. One the emitter cannot read as an object is reported through `invalid-required-binding-field` and costs the binding the same way.

`deduplicationScope` is `queue` or `messageGroup`. `fifoThroughputLimit` is `perQueue` or `perMessageGroupId`. The four time fields are numbers of seconds and are zero or more.

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

| Field    | Type                 | Required |
| -------- | -------------------- | -------- |
| `queues` | `AsyncAPISqsQueue[]` | **yes**  |

Apply it to an operation that carries `@send` or `@receive`.

`queues` is required, and every entry requires a `name`. An entry without one is reported through `missing-binding-field`, and the binding is dropped whole. An empty list is reported as a missing `queues`, because an empty list names no queue.

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
