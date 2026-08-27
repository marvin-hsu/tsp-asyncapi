---
title: "AMQP"
description: "The AMQP binding. The emitted member is `amqp`, and every object carries `bindingVersion: 0.3.0`."
---

# AMQP

The AMQP binding. The emitted member is `amqp`, and every object carries `bindingVersion: 0.3.0`.

## `@amqpChannel`

```typespec
extern dec amqpChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIAmqpChannelBinding
);
```

| Field      | Type                   | Required |
| ---------- | ---------------------- | -------- |
| `is`       | `string`               | no       |
| `exchange` | `AsyncAPIAmqpExchange` | no       |
| `queue`    | `AsyncAPIAmqpQueue`    | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

::: warning
`is` is a TypeSpec keyword. Write the field name in backticks: `` `is`: "routingKey" ``. The emitted member is still `is`.
:::

`is` is `queue` or `routingKey`. `exchange.type` is one of `topic`, `direct`, `fanout`, `default` and `headers`. A name of an exchange or a queue is at most 255 characters.

The member covers AMQP 0-9-1. AsyncAPI defines a separate `amqp1` binding for AMQP 1.0, and the emitter does not write it.

```typespec
@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "events", type: "topic", durable: true }
})
@channel("events.created")
interface EventChannel {}
```

```yaml
channels:
  events.created:
    address: events.created
    bindings:
      amqp:
        is: routingKey
        exchange:
          name: events
          type: topic
          durable: true
        bindingVersion: 0.3.0
```

## `@amqpOperation`

```typespec
extern dec amqpOperation(target: Operation, config: valueof AsyncAPIAmqpOperationBinding);
```

| Field          | Type       | Required |
| -------------- | ---------- | -------- |
| `expiration`   | `int32`    | no       |
| `userId`       | `string`   | no       |
| `cc`           | `string[]` | no       |
| `priority`     | `int32`    | no       |
| `deliveryMode` | `int32`    | no       |
| `mandatory`    | `boolean`  | no       |
| `bcc`          | `string[]` | no       |
| `timestamp`    | `boolean`  | no       |
| `ack`          | `boolean`  | no       |

Apply it to an operation that carries `@send` or `@receive`.

`deliveryMode` is `1` for transient and `2` for persistent. `expiration` is a number of milliseconds and is zero or more.

The emitted field order follows the specification, not the order the fields were written.

```typespec
@send
@amqpOperation(#{ deliveryMode: 2, expiration: 60000, mandatory: true })
op publish(event: EventCreated): void;
```

```yaml
operations:
  publish:
    action: send
    channel:
      $ref: "#/channels/events.created"
    bindings:
      amqp:
        expiration: 60000
        deliveryMode: 2
        mandatory: true
        bindingVersion: 0.3.0
```

## `@amqpMessage`

```typespec
extern dec amqpMessage(target: Model, config: valueof AsyncAPIAmqpMessageBinding);
```

| Field             | Type     | Required |
| ----------------- | -------- | -------- |
| `contentEncoding` | `string` | no       |
| `messageType`     | `string` | no       |

Apply it to a model that also carries `@message`. AMQP states no set of values for either field.

```typespec
@message
@amqpMessage(#{ contentEncoding: "gzip", messageType: "event.created" })
model EventCreated {
  eventId: string;
}
```

```yaml
components:
  messages:
    EventCreated:
      name: EventCreated
      payload:
        $ref: "#/components/schemas/EventCreated"
      bindings:
        amqp:
          contentEncoding: gzip
          messageType: event.created
          bindingVersion: 0.3.0
```
