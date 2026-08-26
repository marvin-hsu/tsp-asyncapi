---
title: "Anypoint MQ"
description: "The Anypoint MQ binding. The emitted member is `anypointmq`, and every object carries `bindingVersion: 0.0.1`."
---

# Anypoint MQ

The Anypoint MQ binding. The emitted member is `anypointmq`, and every object carries `bindingVersion: 0.0.1`.

## `@anypointMqChannel`

```typespec
extern dec anypointMqChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIAnypointMqChannelBinding
);
```

| Field             | Type     | Required |
| ----------------- | -------- | -------- |
| `destination`     | `string` | no       |
| `destinationType` | `string` | no       |

`destinationType` is `exchange`, `queue` or `fifo-queue`.

```typespec
@anypointMqChannel(#{ destination: "orders", destinationType: "queue" })
@channel("orders")
interface OrderChannel {}
```

```yaml
channels:
  orders:
    address: orders
    bindings:
      anypointmq:
        destination: orders
        destinationType: queue
        bindingVersion: 0.0.1
```

## `@anypointMqMessage`

```typespec
extern dec anypointMqMessage(
  target: Model,
  config: valueof AsyncAPIAnypointMqMessageBinding
);
```

| Field     | Type      | Required |
| --------- | --------- | -------- |
| `headers` | `unknown` | no       |

`headers` is a Schema Object. Anypoint MQ states no rule about its shape, unlike the HTTP and WebSocket bindings.

```typespec
@message
@anypointMqMessage(#{
  headers: #{ type: "object", properties: #{ tenantId: #{ type: "string" } } }
})
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      payload:
        $ref: "#/components/schemas/OrderCreated"
      bindings:
        anypointmq:
          headers:
            type: object
            properties:
              tenantId:
                type: string
          bindingVersion: 0.0.1
```
