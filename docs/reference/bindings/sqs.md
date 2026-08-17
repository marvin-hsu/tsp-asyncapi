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

`deadLetterQueue` is optional and has the same shape. One that is written but incomplete is reported and dropped, and the rest of the binding is kept.

`deduplicationScope` is `queue` or `messageGroup`. `fifoThroughputLimit` is `perQueue` or `perMessageGroupId`. The four time fields are numbers of seconds and are never negative.

## `@sqsOperation`

```typespec
extern dec sqsOperation(target: Operation, config: valueof AsyncAPISqsOperationBinding);
```

| Field    | Type                 | Required |
| -------- | -------------------- | -------- |
| `queues` | `AsyncAPISqsQueue[]` | **yes**  |

Apply it to an operation that carries `@send` or `@receive`.

`queues` is required, and every entry requires a `name`. An entry without one is reported and dropped. A list left with no entry is reported as a missing `queues`, because an empty list names no queue.

A queue here requires only a name. The channel binding requires a `fifoQueue` as well, which is the difference AsyncAPI states between the two levels.
