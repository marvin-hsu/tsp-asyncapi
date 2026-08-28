---
title: "JMS"
description: "The JMS binding. The emitted member is `jms`, and every object carries `bindingVersion: 0.0.1`."
---

# JMS

The JMS binding. The emitted member is `jms`, and every object carries `bindingVersion: 0.0.1`.

## `@jmsServer`

```typespec
extern dec jmsServer(target: Namespace, config: valueof AsyncAPIJmsServerBinding);
```

| Field                  | Type        | Required |
| ---------------------- | ----------- | -------- |
| `jmsConnectionFactory` | `string`    | **yes**  |
| `properties`           | `unknown[]` | no       |
| `clientID`             | `string`    | no       |

Apply it to the service namespace.

`jmsConnectionFactory` is required. A binding without it is reported through `missing-binding-field` and dropped whole.

Each entry of `properties` is an object with a `name` and a `value`. An entry outside that is reported through `invalid-binding-field` and dropped. The rest of the binding is kept.

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

| Field             | Type     | Required |
| ----------------- | -------- | -------- |
| `destination`     | `string` | no       |
| `destinationType` | `string` | no       |

`destinationType` is `queue` or `fifo-queue`. JMS states no `exchange`, unlike Anypoint MQ.

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

| Field     | Type      | Required |
| --------- | --------- | -------- |
| `headers` | `unknown` | no       |

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
