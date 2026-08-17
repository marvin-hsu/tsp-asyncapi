# Protocol bindings

AsyncAPI describes protocol-specific settings in a Bindings Object. The specification puts one on four objects: a server, a channel, an operation, and a message. Each member of that object names a protocol, such as `kafka`.

This library ships decorators for thirteen protocols: Kafka, WebSocket, MQTT, HTTP, AMQP, NATS, Pulsar, Google Cloud Pub/Sub, Amazon SQS, Anypoint MQ, JMS, IBM MQ and Solace. It also ships a generic decorator, `@binding`, for the names AsyncAPI reserves but gives no fields.

One protocol claims one member per object. Two decorators that claim the same member on the same object are an error. The emitter never merges the two configurations, and the later one never replaces the earlier one.

## The protocols

| Protocol                                | Member         | Version | Objects                                |
| --------------------------------------- | -------------- | ------- | -------------------------------------- |
| [Kafka](./kafka)                        | `kafka`        | 0.5.0   | server / channel / operation / message |
| [WebSocket](./websocket)                | `ws`           | 0.1.0   | channel                                |
| [MQTT](./mqtt)                          | `mqtt`         | 0.2.0   | server / operation / message           |
| [HTTP](./http)                          | `http`         | 0.3.0   | operation / message                    |
| [AMQP 0-9-1](./amqp)                    | `amqp`         | 0.3.0   | channel / operation / message          |
| [NATS](./nats)                          | `nats`         | 0.1.0   | operation                              |
| [Pulsar](./pulsar)                      | `pulsar`       | 0.1.0   | server / channel                       |
| [Google Cloud Pub/Sub](./google-pubsub) | `googlepubsub` | 0.2.0   | channel / message                      |
| [Amazon SQS](./sqs)                     | `sqs`          | 0.2.0   | channel / operation                    |
| [Anypoint MQ](./anypoint-mq)            | `anypointmq`   | 0.0.1   | channel / message                      |
| [JMS](./jms)                            | `jms`          | 0.0.1   | server / channel / message             |
| [IBM MQ](./ibm-mq)                      | `ibmmq`        | 0.1.0   | server / channel / message             |
| [Solace](./solace)                      | `solace`       | 0.4.0   | server / operation                     |

## `@binding`

```typespec
extern dec binding(target: unknown, protocol: valueof string, config: valueof unknown);
```

Adds one raw binding to whichever object the target emits. Use it for a field a newer version of a binding added, and for the three protocols below that carry no fields.

::: warning
The member names of a Bindings Object are a closed list. AsyncAPI names every protocol it knows, and a parser rejects any other name with "Property '\<name\>' is not expected to be here". So `@binding("mycorp", ...)` writes a document that fails validation.

For a protocol of your own, use a name that starts with `x-`. That prefix is the specification extension mechanism, and a parser accepts it anywhere.
:::

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
  orders.created:
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

Every named binding carries the version of the specification its fields follow. The emitter always writes the field, and the value cannot be changed through a decorator. The table above lists the version each protocol carries.

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
