---
title: "NATS"
description: "The NATS binding. The emitted member is `nats`, and every object carries `bindingVersion: 0.1.0`."
---

# NATS

The NATS binding. The emitted member is `nats`, and every object carries `bindingVersion: 0.1.0`.

## `@natsOperation`

```typespec
extern dec natsOperation(target: Operation, config: valueof AsyncAPINatsOperationBinding);
```

| Field   | Type     | Required |
| ------- | -------- | -------- |
| `queue` | `string` | no       |

Apply it to an operation that carries `@send` or `@receive`.

`queue` names the queue group the subscription joins. NATS delivers each message to one member of a queue group rather than to all of them. The name is at most 255 characters.

NATS defines no server, channel or message binding.

```typespec
@send
@natsOperation(#{ queue: "order-workers" })
op publish(event: OrderCreated): void;
```

```yaml
operations:
  publish:
    action: send
    channel:
      $ref: "#/channels/orders.in"
    bindings:
      nats:
        queue: order-workers
        bindingVersion: 0.1.0
```
