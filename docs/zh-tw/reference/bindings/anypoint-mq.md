---
title: "Anypoint MQ"
description: "Anypoint MQ binding。輸出的成員是 `anypointmq`，每個物件都帶 `bindingVersion: 0.0.1`。"
---

# Anypoint MQ

Anypoint MQ binding。輸出的成員是 `anypointmq`，每個物件都帶 `bindingVersion: 0.0.1`。

## `@anypointMqChannel`

```typespec
extern dec anypointMqChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIAnypointMqChannelBinding
);
```

| 欄位              | 型別     | 必填 |
| ----------------- | -------- | ---- |
| `destination`     | `string` | 否   |
| `destinationType` | `string` | 否   |

`destinationType` 是 `exchange`、`queue` 或 `fifo-queue`。

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

| 欄位      | 型別      | 必填 |
| --------- | --------- | ---- |
| `headers` | `unknown` | 否   |

`headers` 是 Schema Object。Anypoint MQ 對它的形狀沒有規定，這一點和 HTTP 與 WebSocket binding 不同。

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
