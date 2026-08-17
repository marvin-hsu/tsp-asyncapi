# Protocol bindings

AsyncAPI describes protocol-specific settings in a Bindings Object. The specification puts one on four objects: a server, a channel, an operation, and a message. Each member of that object names a protocol, such as `kafka`.

This library ships decorators for twelve protocols: Kafka, WebSocket, MQTT, HTTP, AMQP, NATS, Pulsar, Google Cloud Pub/Sub, Amazon SQS, Anypoint MQ, JMS, IBM MQ and Solace. It also ships a generic decorator for every other protocol.

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

## `@websocketChannel`

```typespec
extern dec websocketChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIWebSocketChannelBinding
);
```

| Field     | Type      | Required |
| --------- | --------- | -------- |
| `method`  | `string`  | no       |
| `query`   | `unknown` | no       |
| `headers` | `unknown` | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

The emitted member is `ws`. AsyncAPI names the binding folder `websockets`, and it names the member `ws`. The member name is what a reader of the document sees.

`method` is the HTTP method that opens the connection. AsyncAPI allows `GET` and `POST`. Any other value is reported through `invalid-binding-field`. The field is dropped and the rest of the binding is kept.

`query` and `headers` describe the handshake. Each one is a Schema Object. Write it as an object literal of type `object` with a `properties` key. AsyncAPI states both requirements. A schema that meets neither describes no parameter, so the emitter reports it and drops the field. A `$ref` passes without either key, because the schema behind it lives elsewhere.

The WebSocket binding has no server, operation or message object. The specification states that all three must carry no property. So `@websocketChannel` is the whole protocol.

```typespec
@websocketChannel(#{
  method: "GET",
  query: #{ type: "object", properties: #{ token: #{ type: "string" } } }
})
@channel("/ticks")
interface TickStream {
  @send
  op publish(event: Tick): void;
}
```

```yaml
channels:
  TickStream:
    address: /ticks
    bindings:
      ws:
        method: GET
        query:
          type: object
          properties:
            token:
              type: string
        bindingVersion: 0.1.0
```

## `@mqttServer`

```typespec
extern dec mqttServer(target: Namespace, config: valueof AsyncAPIMqttServerBinding);
```

| Field                   | Type                   | Required |
| ----------------------- | ---------------------- | -------- |
| `clientId`              | `string`               | no       |
| `cleanSession`          | `boolean`              | no       |
| `lastWill`              | `AsyncAPIMqttLastWill` | no       |
| `keepAlive`             | `int32`                | no       |
| `sessionExpiryInterval` | `unknown`              | no       |
| `maximumPacketSize`     | `unknown`              | no       |

Apply it to the service namespace. Every server that namespace declares gets its own copy.

`lastWill` is the message the broker sends when the client goes away without saying goodbye. Its `qos` is `0`, `1` or `2`. A value outside that is reported and dropped, and the rest of the will is kept.

`sessionExpiryInterval` and `maximumPacketSize` are MQTT 5 fields. Write each one as a number, or as a Schema Object describing the number.

## `@mqttOperation`

```typespec
extern dec mqttOperation(target: Operation, config: valueof AsyncAPIMqttOperationBinding);
```

| Field                   | Type      | Required |
| ----------------------- | --------- | -------- |
| `qos`                   | `int32`   | no       |
| `retain`                | `boolean` | no       |
| `messageExpiryInterval` | `unknown` | no       |

Apply it to an operation that carries `@send` or `@receive`.

`qos` is `0`, `1` or `2`. Any other value is reported and dropped.

## `@mqttMessage`

```typespec
extern dec mqttMessage(target: Model, config: valueof AsyncAPIMqttMessageBinding);
```

| Field                    | Type      | Required |
| ------------------------ | --------- | -------- |
| `payloadFormatIndicator` | `int32`   | no       |
| `correlationData`        | `unknown` | no       |
| `contentType`            | `string`  | no       |
| `responseTopic`          | `unknown` | no       |

Apply it to a model that also carries `@message`. All four fields are MQTT 5 fields.

`payloadFormatIndicator` is `0` for unspecified bytes and `1` for UTF-8. `correlationData` is a Schema Object. `responseTopic` is a topic name, or a Schema Object describing the name.

## `@httpOperation`

```typespec
extern dec httpOperation(target: Operation, config: valueof AsyncAPIHttpOperationBinding);
```

| Field    | Type      | Required |
| -------- | --------- | -------- |
| `method` | `string`  | no       |
| `query`  | `unknown` | no       |

Apply it to an operation that carries `@send` or `@receive`.

`method` is one of `GET`, `PUT`, `POST`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `CONNECT` and `TRACE`.

`query` is a Schema Object of type `object` with a `properties` key. AsyncAPI states both requirements.

## `@httpMessage`

```typespec
extern dec httpMessage(target: Model, config: valueof AsyncAPIHttpMessageBinding);
```

| Field        | Type      | Required |
| ------------ | --------- | -------- |
| `headers`    | `unknown` | no       |
| `statusCode` | `int32`   | no       |

Apply it to a model that also carries `@message`.

`headers` is a Schema Object of type `object` with a `properties` key.

`statusCode` is a status code from RFC 9110, so it is between 100 and 599. AsyncAPI states that it applies only to a message named by an Operation Reply Object. The emitter does not check that rule, because it spans two objects.

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

The member covers AMQP 0-9-1. AsyncAPI defines a separate `amqp1` binding for AMQP 1.0, and this library does not emit it.

```typespec
@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "events", type: "topic", durable: true }
})
@channel("events.created")
interface EventChannel {}
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

`deliveryMode` is `1` for transient and `2` for persistent. `expiration` is a number of milliseconds, so it is never negative.

The emitted field order follows the specification, not the order the fields were written.

## `@amqpMessage`

```typespec
extern dec amqpMessage(target: Model, config: valueof AsyncAPIAmqpMessageBinding);
```

| Field             | Type     | Required |
| ----------------- | -------- | -------- |
| `contentEncoding` | `string` | no       |
| `messageType`     | `string` | no       |

Apply it to a model that also carries `@message`. AMQP states no set of values for either field.

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

## `@pulsarServer`

```typespec
extern dec pulsarServer(target: Namespace, config: valueof AsyncAPIPulsarServerBinding);
```

| Field    | Type     | Required |
| -------- | -------- | -------- |
| `tenant` | `string` | no       |

Apply it to the service namespace. A topic is addressed as `<tenant>/<namespace>/<topic>`, so this field and the channel `namespace` are two parts of one address.

## `@pulsarChannel`

```typespec
extern dec pulsarChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIPulsarChannelBinding
);
```

| Field            | Type                      | Required |
| ---------------- | ------------------------- | -------- |
| `namespace`      | `string`                  | **yes**  |
| `persistence`    | `string`                  | **yes**  |
| `compaction`     | `int32`                   | no       |
| `geoReplication` | `string[]`                | no       |
| `retention`      | `AsyncAPIPulsarRetention` | no       |
| `ttl`            | `int32`                   | no       |
| `deduplication`  | `boolean`                 | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

::: warning
`namespace` is a TypeSpec keyword. Write the field name in backticks: `` `namespace`: "orders" ``. The emitted field is still `namespace`.
:::

`namespace` and `persistence` are required. A binding without either one is reported through `missing-binding-field` and dropped whole. `persistence` is `persistent` or `non-persistent`.

`geoReplication` is written under that name because a TypeSpec field name cannot hold a dash. The emitted field is `geo-replication`.

`retention.time` and `retention.size` are zero or more. Zero disables retention on that measure.

## `@googlePubSubChannel`

```typespec
extern dec googlePubSubChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIGooglePubSubChannelBinding
);
```

| Field                      | Type                                 | Required |
| -------------------------- | ------------------------------------ | -------- |
| `schemaSettings`           | `AsyncAPIGooglePubSubSchemaSettings` | **yes**  |
| `labels`                   | `Record<unknown>`                    | no       |
| `messageRetentionDuration` | `string`                             | no       |
| `messageStoragePolicy`     | `AsyncAPIGooglePubSubStoragePolicy`  | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

`schemaSettings` is required, and it requires an `encoding` and a `name` of its own. A binding without them is reported through `missing-binding-field` and dropped whole.

`labels` is an open map. Pub/Sub puts no rule on its keys or values, so it is emitted as written.

## `@googlePubSubMessage`

```typespec
extern dec googlePubSubMessage(
  target: Model,
  config: valueof AsyncAPIGooglePubSubMessageBinding
);
```

| Field         | Type                         | Required |
| ------------- | ---------------------------- | -------- |
| `attributes`  | `Record<unknown>`            | no       |
| `orderingKey` | `string`                     | no       |
| `schema`      | `AsyncAPIGooglePubSubSchema` | no       |

Apply it to a model that also carries `@message`. No field is required.

`schema` is optional, but a `schema` written without a `name` names no schema, so it is reported and dropped.

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

`destinationType` is `queue` or `fifo-queue`. JMS lists no `exchange`, unlike Anypoint MQ.

## `@jmsMessage`

```typespec
extern dec jmsMessage(target: Model, config: valueof AsyncAPIJmsMessageBinding);
```

| Field     | Type      | Required |
| --------- | --------- | -------- |
| `headers` | `unknown` | no       |

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

`type` is `string`, `jms` or `binary`. `expiry` is a number of milliseconds and is never negative. Zero means the message never expires.

`headers` is a comma-separated list of header names, not a Schema Object. IBM MQ is the one binding in this library that states the field that way.

## `@solaceServer`

```typespec
extern dec solaceServer(target: Namespace, config: valueof AsyncAPISolaceServerBinding);
```

| Field        | Type     | Required |
| ------------ | -------- | -------- |
| `msgVpn`     | `string` | no       |
| `clientName` | `string` | no       |

Apply it to the service namespace. `clientName` is at most 160 characters.

The emitted field is `msgVpn`. Version 0.2.0 of the Solace binding spells it `msvVpn`, and this library emits 0.4.0.

## `@solaceOperation`

```typespec
extern dec solaceOperation(target: Operation, config: valueof AsyncAPISolaceOperationBinding);
```

| Field          | Type        | Required |
| -------------- | ----------- | -------- |
| `destinations` | `unknown[]` | no       |
| `timeToLive`   | `int32`     | no       |
| `priority`     | `int32`     | no       |
| `dmqEligible`  | `boolean`   | no       |

Apply it to an operation that carries `@send` or `@receive`.

Each entry of `destinations` may carry a `deliveryMode` of `direct` or `persistent`. Any other value is reported and dropped from that entry, and the rest of the entry is kept. The rest of an entry is emitted as written.

`priority` is zero or more.

## Protocols with no named decorator

AsyncAPI reserves five more member names. This library ships no decorator for them, for two reasons.

`amqp1`, `redis` and `stomp` are accepted by the AsyncAPI parser, and each one carries no field. A named decorator would validate nothing and stamp no version, so `@binding("redis", #{})` already says everything they can say.

`mercure`, `mqtt5` and `ros2` are rejected by the AsyncAPI parser at every level of an AsyncAPI 3.0 document. A document carrying one of them fails validation, so this library emits neither a decorator nor a generic binding that would produce one.

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

Every named binding carries the version of the specification its fields follow. The emitter always writes the field, and the value cannot be changed through a decorator.

| Protocol             | Member         | Version |
| -------------------- | -------------- | ------- |
| Kafka                | `kafka`        | 0.5.0   |
| WebSocket            | `ws`           | 0.1.0   |
| MQTT                 | `mqtt`         | 0.2.0   |
| HTTP                 | `http`         | 0.3.0   |
| AMQP                 | `amqp`         | 0.3.0   |
| NATS                 | `nats`         | 0.1.0   |
| Pulsar               | `pulsar`       | 0.1.0   |
| Google Cloud Pub/Sub | `googlepubsub` | 0.2.0   |
| Amazon SQS           | `sqs`          | 0.2.0   |
| Anypoint MQ          | `anypointmq`   | 0.0.1   |
| JMS                  | `jms`          | 0.0.1   |
| IBM MQ               | `ibmmq`        | 0.1.0   |
| Solace               | `solace`       | 0.4.0   |

AsyncAPI states that a reader must assume `latest` when the field is absent. What `latest` holds changes over time, so the version is always written.

`@binding` writes no version at all. Add the field to the config when you need one.

## Diagnostics

| Code                       | Severity | When                                                         |
| -------------------------- | -------- | ------------------------------------------------------------ |
| `duplicate-binding`        | error    | One protocol is claimed twice at one level on one target.    |
| `empty-binding-protocol`   | error    | The protocol name given to `@binding` is blank.              |
| `invalid-binding-config`   | error    | The config given to `@binding` is not an object.             |
| `invalid-binding-field`    | warning  | One binding field carries a value the specification forbids. |
| `binding-outside-document` | warning  | A binding sits on a target that emits no such object.        |
| `missing-binding-field`    | error    | A binding does not give a field the specification requires.  |

`invalid-binding-field` is a warning because the emitter drops only that field. The rest of the binding is kept, and the document is still written. The other codes are errors because each of them drops a whole binding. A binding missing a required field cannot be written as a valid document, so nothing of it survives for the author to inspect.

See [Diagnostics](/reference/diagnostics) for the full list.
