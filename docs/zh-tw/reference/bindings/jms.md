---
title: "JMS"
description: "JMS binding。輸出的成員是 `jms`，每個物件都帶 `bindingVersion: 0.0.1`。"
---

# JMS

JMS binding。輸出的成員是 `jms`，每個物件都帶 `bindingVersion: 0.0.1`。

## `@jmsServer`

```typespec
extern dec jmsServer(target: Namespace, config: valueof AsyncAPIJmsServerBinding);
```

| 欄位                   | 型別        | 必填   |
| ---------------------- | ----------- | ------ |
| `jmsConnectionFactory` | `string`    | **是** |
| `properties`           | `unknown[]` | 否     |
| `clientID`             | `string`    | 否     |

套用在服務 namespace 上。

`jmsConnectionFactory` 是必填。缺它時，binding 會透過 `missing-binding-field` 回報並整個丟棄。

```typespec
@service(#{ title: "Orders" })
@server("prod", #{ host: "jms.example.com:61616", protocol: "jms" })
@jmsServer(#{ jmsConnectionFactory: "ConnectionFactory", clientID: "orders-service" })
namespace Orders;
```

```yaml
servers:
  prod:
    host: jms.example.com:61616
    protocol: jms
    bindings:
      jms:
        jmsConnectionFactory: ConnectionFactory
        clientID: orders-service
        bindingVersion: 0.0.1
```

## `@jmsChannel`

```typespec
extern dec jmsChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIJmsChannelBinding
);
```

| 欄位              | 型別     | 必填 |
| ----------------- | -------- | ---- |
| `destination`     | `string` | 否   |
| `destinationType` | `string` | 否   |

`destinationType` 是 `queue` 或 `fifo-queue`。JMS 沒有列 `exchange`，這一點和 Anypoint MQ 不同。

```typespec
@jmsChannel(#{ destination: "orders", destinationType: "queue" })
@channel("orders.jms")
interface OrderChannel {}
```

```yaml
channels:
  orders.jms:
    address: orders.jms
    bindings:
      jms:
        destination: orders
        destinationType: queue
        bindingVersion: 0.0.1
```

## `@jmsMessage`

```typespec
extern dec jmsMessage(target: Model, config: valueof AsyncAPIJmsMessageBinding);
```

| 欄位      | 型別      | 必填 |
| --------- | --------- | ---- |
| `headers` | `unknown` | 否   |

```typespec
@message
@jmsMessage(#{
  headers: #{ type: "object", properties: #{ JMSType: #{ type: "string" } } }
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
        jms:
          headers:
            type: object
            properties:
              JMSType:
                type: string
          bindingVersion: 0.0.1
```
