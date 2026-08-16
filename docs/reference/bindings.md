# Protocol bindings

AsyncAPI describes protocol-specific settings in a Bindings Object. The specification puts one on four objects: a server, a channel, an operation, and a message. Each member of that object names a protocol, such as `kafka`.

This library ships decorators for the Kafka bindings. It also ships a generic decorator for every other protocol.

One protocol claims one member per object. Two decorators that claim the same member on the same object are an error. The emitter never merges the two configurations, and the later one never replaces the earlier one.

## `@binding`

```typespec
extern dec binding(target: unknown, protocol: valueof string, config: valueof unknown);
```

Adds one raw binding to whichever object the target emits. Use it for a protocol that has no decorator here yet. Use it also for a field a newer version of a binding added.

The config is emitted as written. This decorator adds no `bindingVersion`. It does not read the shape of the config, so it cannot know which version the fields belong to. Write that field yourself when the protocol needs it.

```typespec
@binding("mqtt", #{ qos: 2, retain: true })
@channel("orders.created")
interface OrderChannel {
  @send
  op publish(event: OrderCreated): void;
}
```

```yaml
channels:
  OrderChannel:
    address: orders.created
    bindings:
      mqtt:
        qos: 2
        retain: true
```

The target is `unknown`, because all four positions are reachable. This decorator names no level. The binding lands wherever the target emits an object.

::: warning
A namespace can be both the service namespace and a channel target. A `@binding` there reaches the server and the channel. Use the protocol-specific decorator when only one of the two is meant.
:::

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
  OrderChannel:
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
      $ref: "#/channels/OrderChannel"
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

## Rules that span two objects

::: warning
Four Kafka fields need a schema registry. The registry URL sits on the server binding. The Kafka binding specification states that the following fields must not be used without a server-level `schemaRegistryUrl`:

- `schemaRegistryVendor`, on the server binding
- `schemaIdLocation`, on the message binding
- `schemaIdPayloadEncoding`, on the message binding
- `schemaLookupStrategy`, on the message binding

The emitter does not check these rules. Each one spans two objects of the document. Set `schemaRegistryUrl` on the service namespace whenever you use any of the four fields.
:::

## The binding version

Every Kafka binding carries `bindingVersion: 0.5.0`. The emitter always writes it, and the value cannot be changed through a decorator.

`@binding` writes no version at all. Add the field to the config when you need one.

## Diagnostics

| Code                       | Severity | When                                                         |
| -------------------------- | -------- | ------------------------------------------------------------ |
| `duplicate-binding`        | error    | One protocol is claimed twice at one level on one target.    |
| `empty-binding-protocol`   | error    | The protocol name given to `@binding` is blank.              |
| `invalid-binding-config`   | error    | The config given to `@binding` is not an object.             |
| `invalid-binding-field`    | warning  | One binding field carries a value the specification forbids. |
| `binding-outside-document` | warning  | A binding sits on a target that emits no such object.        |

`invalid-binding-field` is a warning because the emitter drops only that field. The rest of the binding is kept, and the document is still written. The four codes above it are errors because each of them drops a whole binding.

See [Diagnostics](/reference/diagnostics) for the full list.
