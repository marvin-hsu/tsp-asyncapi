---
title: "Kafka"
description: "The Kafka binding. The emitted member is `kafka`, and every object carries `bindingVersion: 0.5.0`."
---

# Kafka

The Kafka binding. The emitted member is `kafka`, and every object carries `bindingVersion: 0.5.0`.

## `@kafkaServer`

```typespec
extern dec kafkaServer(target: Namespace, config: valueof AsyncAPIKafkaServerBinding);
```

| Field                  | Type     | Required |
| ---------------------- | -------- | -------- |
| `schemaRegistryUrl`    | `string` | no       |
| `schemaRegistryVendor` | `string` | no       |

Apply it to the service namespace.

::: warning
Every server that namespace declares gets its own copy of the binding. `@server` is repeatable and keyed by name, so no decorator target can single one server out. This follows the rule the namespace-level `security` and `externalDocs` already use. Two servers of one namespace cannot name two different schema registries.
:::

```typespec
@service(#{ title: "Orders" })
@server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
@kafkaServer(#{
  schemaRegistryUrl: "https://registry.example.com",
  schemaRegistryVendor: "confluent"
})
namespace Orders;
```

```yaml
servers:
  prod:
    host: kafka.example.com:9092
    protocol: kafka
    bindings:
      kafka:
        schemaRegistryUrl: https://registry.example.com
        schemaRegistryVendor: confluent
        bindingVersion: 0.5.0
```

## `@kafkaChannel`

```typespec
extern dec kafkaChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIKafkaChannelBinding
);
```

| Field                | Type              | Required |
| -------------------- | ----------------- | -------- |
| `topic`              | `string`          | no       |
| `partitions`         | `int32`           | no       |
| `replicas`           | `int32`           | no       |
| `topicConfiguration` | `Record<unknown>` | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

`partitions` and `replicas` are positive integers. A value outside that range is reported through `invalid-binding-field`. The field is dropped and the rest of the binding is kept.

`topicConfiguration` is an open map. AsyncAPI states that the object may carry additional properties. Kafka names its topic settings with dots, so a vendor setting such as `confluent.value.schema.validation` stays legal. The emitter checks one value only. The entries of `cleanup.policy` must be `delete` or `compact`. The binding types that field as a list. Write a single value in place of the list, and the emitter writes it as a one-entry list.

```typespec
@kafkaChannel(#{
  topic: "orders.created",
  partitions: 12,
  replicas: 3,
  topicConfiguration: #{ `cleanup.policy`: #["compact"] }
})
@channel("orders.created")
interface OrderChannel {
  @send
  op publish(event: OrderCreated): void;
}
```

```yaml
channels:
  orders.created:
    address: orders.created
    bindings:
      kafka:
        topic: orders.created
        partitions: 12
        replicas: 3
        topicConfiguration:
          cleanup.policy:
            - compact
        bindingVersion: 0.5.0
```

## `@kafkaOperation`

```typespec
extern dec kafkaOperation(target: Operation, config: valueof AsyncAPIKafkaOperationBinding);
```

| Field      | Type      | Required |
| ---------- | --------- | -------- |
| `groupId`  | `unknown` | no       |
| `clientId` | `unknown` | no       |

Apply it to an operation that carries `@send` or `@receive`.

Both fields are Schema Objects. Write each one as an object literal. The emitter writes it into the document as written. A value that is not an object is reported through `invalid-binding-field`.

```typespec
@channel("orders.created")
interface OrderChannel {
  @kafkaOperation(#{ groupId: #{ type: "string" }, clientId: #{ type: "string" } })
  @receive
  op onOrderCreated(): OrderCreated;
}
```

```yaml
operations:
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/orders.created"
    bindings:
      kafka:
        groupId:
          type: string
        clientId:
          type: string
        bindingVersion: 0.5.0
```

## `@kafkaMessage`

```typespec
extern dec kafkaMessage(target: Model, config: valueof AsyncAPIKafkaMessageBinding);
```

| Field                     | Type      | Required |
| ------------------------- | --------- | -------- |
| `key`                     | `unknown` | no       |
| `schemaIdLocation`        | `string`  | no       |
| `schemaIdPayloadEncoding` | `string`  | no       |
| `schemaLookupStrategy`    | `string`  | no       |

Apply it to a model that carries `@message`.

`key` is a Schema Object. Write it as an object literal, the same way `groupId` is written. A TypeSpec type is not accepted here, and the emitter does not check the fields of the object you write.

`schemaIdLocation` is `header` or `payload`. Any other value is reported through `invalid-binding-field`.

```typespec
@kafkaMessage(#{
  key: #{ type: "string" },
  schemaIdLocation: "payload",
  schemaIdPayloadEncoding: "apicurio-new",
  schemaLookupStrategy: "TopicIdStrategy"
})
@message
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
        kafka:
          key:
            type: string
          schemaIdLocation: payload
          schemaIdPayloadEncoding: apicurio-new
          schemaLookupStrategy: TopicIdStrategy
          bindingVersion: 0.5.0
```
