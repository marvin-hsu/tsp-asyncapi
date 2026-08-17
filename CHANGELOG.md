# Changelog

This project follows [semantic versioning](https://semver.org/). It is still
in `0.x`, so a minor release may carry a breaking change. Any that does says
so at the top of its entry.

## 0.2.0

Twelve more protocols, and the emitter now checks the field rules of each one
rather than passing whatever it was given straight through.

No public export was removed, and no decorator changed its signature, so a
project on 0.1.4 upgrades without editing a line of TypeSpec.

The emitted document does change, and only where 0.1.4 was wrong. Six
decorators were read and then dropped, so a source that used any of them now
produces more than it did. `@discriminated` emitted a bare `anyOf` and now
emits the envelope the specification describes. Regenerate and read the diff
before committing it: every difference should be something you had asked for
all along. The Fixes section below lists them.

### Protocol bindings

Version 0.1.4 shipped four Kafka decorators and the generic `@binding`.
Twelve protocols join them, which is thirty-one binding decorators in all.

| Protocol             | Member         | Binding version | Objects                     |
| -------------------- | -------------- | --------------- | --------------------------- |
| MQTT                 | `mqtt`         | 0.2.0           | server, operation, message  |
| HTTP                 | `http`         | 0.3.0           | operation, message          |
| AMQP 0-9-1           | `amqp`         | 0.3.0           | channel, operation, message |
| NATS                 | `nats`         | 0.1.0           | operation                   |
| Pulsar               | `pulsar`       | 0.1.0           | server, channel             |
| Google Cloud Pub/Sub | `googlepubsub` | 0.2.0           | channel, message            |
| Amazon SQS           | `sqs`          | 0.2.0           | channel, operation          |
| Anypoint MQ          | `anypointmq`   | 0.0.1           | channel, message            |
| JMS                  | `jms`          | 0.0.1           | server, channel, message    |
| IBM MQ               | `ibmmq`        | 0.1.0           | server, channel, message    |
| Solace               | `solace`       | 0.4.0           | server, operation           |
| WebSocket            | `ws`           | 0.1.0           | channel                     |

Every field table was read from the `@asyncapi/specs` JSON schema rather than
from prose, so the member names, the allowed values and the ranges are the
ones the official parser enforces. Each protocol is validated end to end
against that parser.

A named decorator writes `bindingVersion` for you, so an author can no longer
write the wrong one.

Five reserved member names get no decorator, and the reference page says why.
`amqp1`, `redis` and `stomp` carry no field at all. `mercure`, `mqtt5` and
`ros2` are rejected by the AsyncAPI parser at every level of a 3.0 document.

### Diagnostics

Four new codes.

- `missing-binding-field` (error). A binding that leaves out a field its
  specification requires cannot be written as a valid document, so the whole
  binding is dropped. Pulsar needs `namespace` and `persistence`, Pub/Sub
  needs `schemaSettings`, SQS needs `queue` and `queues`, and JMS needs
  `jmsConnectionFactory`. Every missing field of one object is reported, not
  only the first.
- `duplicate-channel-address` (warning). Two channels that carry one address
  produce a valid document, and a reader cannot tell which set of messages
  that address actually carries.
- `visibility-not-applied` (warning). A `@visibility` that the emitter cannot
  act on, rather than silently ignoring it.
- `unserializable-default` (warning). A default the serializer cannot
  represent is left out instead of half-written.

### Fixes

- `@externalDocs` on a model reached no part of the document. It now lands on
  that model's schema.
- `@encode`, `@invisible`, `@visibility`, `@secret`, property defaults and
  `#deprecated` were each read and then dropped. All six now reach the
  schema.
- `@discriminated` emitted a bare `anyOf` instead of the envelope AsyncAPI
  describes.
- Messages could come out in an order that depended on which build ran, and a
  binding consumed by one build could stay marked for the next. Both are
  gone; the emitter holds no state between builds.
- The service namespace's tags never reached the servers, although the field
  is defined on the Server Object.
- IBM MQ allows `headers` on a binary payload and on no other. The emitter
  passed both through, writing a document the parser rejects.

### Two field names need backticks

`is` on the AMQP channel binding and `namespace` on the Pulsar channel
binding are both TypeSpec keywords, so an author writes `` `is` `` and
`` `namespace` ``. The emitted names are unchanged.

### Internals

The emitter is now a three-stage pipeline: `resolve` turns the program and the
decorator state into a semantic model, `lower` turns that model into the
document, and serialization writes the bytes. Nothing is shared between the
stages except values, which is what will make versioning and multi-service
output possible later.

This changed no output. A byte-for-byte baseline over ten programs held
across every step.

## 0.1.4 and earlier

No changelog was kept. Use the commit history.
