# Changelog

This project follows [semantic versioning](https://semver.org/). It is still
in `0.x`, so a minor release may carry a breaking change. Any that does says
so at the top of its entry.

The Traditional Chinese version is [CHANGELOG.zh-TW.md](./CHANGELOG.zh-TW.md).

## 0.4.0

**Breaking for a tool that imports from this package in JavaScript or
TypeScript. Not breaking for a project that writes TypeSpec.**

The emitter is now two packages. `tsp-asyncapi-core` declares the decorators
and the semantic model, and this package turns that model into an AsyncAPI
document. The compiler reads `$onEmit` from a package's entry point, so one
package can hold one emitter, and selecting an output by package name needs
more than one package.

**A TypeSpec project changes nothing.** `import "tsp-asyncapi";` still brings
in every decorator, because this package's `lib/main.tsp` forwards to core in
one line. `tspconfig.yaml` is unchanged, and so is every option name. Every
diagnostic code keeps its `tsp-asyncapi/` prefix: both packages register a
library under that one name, which the compiler supports.

**The output is byte-for-byte identical.** No document changes.

**A JavaScript or TypeScript import may need a new source.** 79 names moved to
`tsp-asyncapi-core`: the 24 readers for decorator state, the 51 state types,
and `$lib` with `reportDiagnostic`, `createDiagnostic`, and `LIBRARY_NAME`.

```js
// Before
import { getChannel, listMessages } from "tsp-asyncapi";
// After
import { getChannel, listMessages } from "tsp-asyncapi-core";
```

This package does not re-export them. Doing so would make it permanently
responsible for core's public surface, which is the coupling the split
removes. `@typespec/openapi3` does not re-export `@typespec/http` either.

The document object types did not move. `AsyncAPIDocument`, `ChannelObject`,
every binding object, and the rest are still imported from `tsp-asyncapi`. This
package's API describes the document it emits, completely.

`PACKAGE_NAME` is new. It is this package's name, which is what
`tspconfig.yaml` writes and what a test host asks the compiler to load.

## 0.3.0

**Behavior changes.** No public export was removed, and no decorator changed
its signature, so a project on 0.2.1 upgrades without editing a line of
TypeSpec. Five checks did get narrower or wider, and each one can change what
an existing program emits or reports. Regenerate and read the diff.

- The `asyncapi-id` and `default-content-type` options now answer to the rule
  every other text field answers to. A blank option is absent, and one that
  says something is trimmed. Both were a bare truthiness test, so a blank
  option reached the document and a padded one kept its padding. The options
  schema sets no minimum length, so an author can write either.
- An array index inside a raw schema `$ref` is now only what RFC 6901 spells:
  `0`, or a digit run with no leading zero. The reader passed the token to
  `Number`, which also reads `""` and `" "` as 0, and `"01"`, `"1.0"`, `"+1"`,
  `"0x1"` and `"1e0"` as 1. Such a `$ref` was reported as resolving. It now
  reports `unresolved-raw-schema-ref`, so a program that carried one starts
  reporting where it did not before.
- A value the serializer cannot represent is now reported and dropped, however
  deep it sits. A failure inside an array reached the document as `null`, and
  one inside an object made that member vanish, both without a word. This
  covers `@binding` and `@jsonSchemaExtension` as well as `@extension`.
- A runtime expression may now hold a line terminator inside a JSON Pointer
  token. RFC 6901 puts no character outside a reference token, and both JSON
  and YAML carry one inside a member name. `@correlationId`,
  `@parameterLocation` and `@replyAddress` all take such an expression.
- A tag metadata conflict is now reported once per declaration. The report
  came out once per reader instead, so one disagreement on a service namespace
  was named two or three times, depending on whether that namespace also
  carried servers or a channel.

### Features

- `@extension` writes one `x-` specification extension on the object its
  target emits. It reaches four objects: `info`, a channel, an operation, and
  a message. A target that emits several of them gets the extension on each
  one. The decorator is repeatable, and the emitted keys follow source order.
  The value is any JSON value, and it is emitted as written.

  A key outside the specification pattern reports `invalid-extension-key`;
  the prefix alone is not enough, because the official parser rejects `x-`
  and `x-has space`. The same key twice on one target reports
  `duplicate-extension-key`, and the first application in source order is
  kept. A value the serializer cannot represent reports
  `unserializable-extension`. A target that emits none of the four objects
  reports `extension-target-not-emitted`.

  A server and a security scheme are not supported. Both are declared with a
  named argument on a namespace, so one `@extension` cannot name which of
  them it means. For a keyword inside a JSON Schema, use
  `@jsonSchemaExtension` instead.

### Tests

The suite carries 53 fast-check properties over seven pure modules. It carried
15 before. Every one was validated by mutation: the module it covers was
broken the way its plan named, and the property had to turn red. Three of the
five behavior changes above are defects those properties found.

### Documentation

- A fifteenth example writes an `x-` field on each object that takes one.
- The other fourteen documents were regenerated. They had not been rebuilt
  since 0.2.1, so the committed output still showed the channel keys and the
  folded lines of 0.2.0.
- Both READMEs record one thing this emitter cannot fix. A member named
  `__proto__` inside a decorator's object value never reaches it: the compiler
  marshals such a value by assigning each member, and an assignment to that
  name sets the prototype instead of adding a member.

## 0.2.1

**Breaking change.** Without an explicit `channelId`, `@channel` now keys the
channel by its address instead of the declaration name of the target. With a
broker such as Kafka, the address is the topic name, and the topic name is
what a reader looks the channel up by. `@dynamicChannel` still keys by the
declaration name, because it has no address. To keep an old key, pass it as
`channelId`. Every `$ref` that points into a channel follows the key, so
regenerate and read the diff.

Two channels without explicit ids that share one address now collide on the
key and report `duplicate-channel-id`. Before, they were both emitted and
only warned through `duplicate-channel-address`. Declare the operations of
one address inside one scope, or give each channel its own `channelId`.

### Fixes

- A `$ref` longer than 80 columns is no longer wrapped across two lines in
  the emitted YAML. A wrapped `$ref` is legal YAML, but a plain-text search
  for the pointer does not find it.

### Documentation

- The rules for `components.schemas` and `components.messages` keys are now
  written down: namespace qualification, what `@friendlyName` overrides, and
  how a character outside the key charset is rewritten.
- The operations page shows one operation that carries several messages, the
  usual shape of a topic with several event variants.

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
