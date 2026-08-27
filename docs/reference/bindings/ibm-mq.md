---
title: "IBM MQ"
description: "The IBM MQ binding. The emitted member is `ibmmq`, and every object carries `bindingVersion: 0.1.0`."
---

# IBM MQ

The IBM MQ binding. The emitted member is `ibmmq`, and every object carries `bindingVersion: 0.1.0`.

## `@ibmMqServer`

```typespec
extern dec ibmMqServer(target: Namespace, config: valueof AsyncAPIIbmMqServerBinding);
```

| Field                  | Type      | Required |
| ---------------------- | --------- | -------- |
| `groupId`              | `string`  | no       |
| `ccdtQueueManagerName` | `string`  | no       |
| `cipherSpec`           | `string`  | no       |
| `multiEndpointServer`  | `boolean` | no       |
| `heartBeatInterval`    | `int32`   | no       |

Apply it to the service namespace.

`heartBeatInterval` is from 0 to 999999 seconds.

AsyncAPI states that `cipherSpec` applies only when the server uses TLS. The emitter does not check that, because the rule spans two objects.

```typespec
@service(#{ title: "Orders" })
@server("prod", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
@ibmMqServer(#{ groupId: "PRODGRP", cipherSpec: "ANY_TLS12", heartBeatInterval: 300 })
namespace Orders;
```

```yaml
servers:
  prod:
    host: mq.example.com:1414
    protocol: ibmmq
    bindings:
      ibmmq:
        groupId: PRODGRP
        cipherSpec: ANY_TLS12
        heartBeatInterval: 300
        bindingVersion: 0.1.0
```

## `@ibmMqChannel`

```typespec
extern dec ibmMqChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIIbmMqChannelBinding
);
```

| Field             | Type              | Required |
| ----------------- | ----------------- | -------- |
| `destinationType` | `string`          | no       |
| `queue`           | `Record<unknown>` | no       |
| `topic`           | `Record<unknown>` | no       |
| `maxMsgLength`    | `int32`           | no       |

`destinationType` is `topic` or `queue`. `maxMsgLength` is from 0 to 104857600 bytes, which is 100 MB.

AsyncAPI states that `queue` applies only when the type is `queue`, and `topic` only when it is `topic`. The emitter does not check that pairing.

```typespec
@ibmMqChannel(#{
  destinationType: "queue",
  queue: #{ objectName: "ORDERS.IN" },
  maxMsgLength: 4194304
})
@channel("orders.in")
interface OrderChannel {}
```

```yaml
channels:
  orders.in:
    address: orders.in
    bindings:
      ibmmq:
        destinationType: queue
        queue:
          objectName: ORDERS.IN
        maxMsgLength: 4194304
        bindingVersion: 0.1.0
```

## `@ibmMqMessage`

```typespec
extern dec ibmMqMessage(target: Model, config: valueof AsyncAPIIbmMqMessageBinding);
```

| Field         | Type     | Required |
| ------------- | -------- | -------- |
| `type`        | `string` | no       |
| `headers`     | `string` | no       |
| `description` | `string` | no       |
| `expiry`      | `int32`  | no       |

`type` is `string`, `jms` or `binary`. `expiry` is a number of milliseconds and is zero or more. Zero means the message never expires.

`headers` is a comma-separated list of header names, not a Schema Object.

IBM MQ allows `headers` on a binary payload only. Written alongside any other `type`, it is reported through `invalid-binding-field`. The field is dropped and the rest of the binding is kept.

```typespec
@message
@ibmMqMessage(#{
  type: "binary",
  headers: "JMSCorrelationID,JMSType",
  expiry: 60000
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
        ibmmq:
          type: binary
          headers: JMSCorrelationID,JMSType
          expiry: 60000
          bindingVersion: 0.1.0
```
