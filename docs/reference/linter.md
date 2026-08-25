---
outline: 2
---

# Linter

The linter reports mistakes the emitter accepts. Each of them produces a valid AsyncAPI document. None of them produces the document the author meant.

A linter rule runs during semantic analysis. It does not run the emitter. So an editor with the TypeSpec extension shows a rule while you type, and a rule reports even when no emitter is configured.

## How a rule differs from a diagnostic

Both appear in compiler output. They are not the same thing.

|           | Diagnostic            | Lint rule                |
| --------- | --------------------- | ------------------------ |
| Runs      | When the emitter runs | During semantic analysis |
| Turned on | Always                | Only when you enable it  |
| Severity  | Error or warning      | Warning only             |
| Code      | `tsp-asyncapi/<code>` | `tsp-asyncapi/<rule>`    |

[Diagnostics](./diagnostics) are a contract. The emitter reports them whenever it finds the problem, and it cannot stop doing so without breaking you.

A rule is a choice you make. That is why a rule can say "you probably did not mean this" about something that is not wrong.

## Turning the linter on

Add a `linter` section to `tspconfig.yaml`:

```yaml
emit:
  - "tsp-asyncapi"

linter:
  extends:
    - "tsp-asyncapi/recommended"
```

`recommended` holds the rules that catch a mistake. A rule is in it when you almost certainly did not mean what you wrote.

To enable one rule by name:

```yaml
linter:
  enable:
    "tsp-asyncapi/unused-security-scheme": true
```

To take one rule out of a set you extend, give the reason:

```yaml
linter:
  extends:
    - "tsp-asyncapi/recommended"
  disable:
    "tsp-asyncapi/channel-without-operation": "This service documents channels it does not serve."
```

`all` enables every rule, including the ones outside `recommended`.

## Rules

Every rule is a warning. A lint rule cannot be an error.

### `missing-service`

In `recommended`.

> This program declares AsyncAPI content but no `@service`. The emitted document falls back to the title "AsyncAPI Document" and the version "0.0.0".

`info.title` and `info.version` are required. When no namespace carries `@service`, the emitter fills both with placeholders. The document is valid, and the two values look enough like real ones to survive a review.

The rule needs a channel. An application declares one; a shared library of `@message` models does not, and it has no service of its own on purpose. So the rule stays quiet in a program with no channel.

```typespec
// Reports.
namespace Orders;

@message
model OrderCreated {
  id: string;
}
```

**Fix:** add `@service` to the namespace that describes the application.

### `channel-without-operation`

In `recommended`.

> Channel '\<id\>' carries messages but no operation marked `@send` or `@receive`.

`@send` and `@receive` put an operation into the `operations` map. Neither is required for a message to reach the channel: the emitter reads the signatures of the operations around the channel either way.

So a channel written without the two decorators is emitted with its messages, and nothing in the document says who publishes or subscribes.

```typespec
// Reports. `publish` carries `OrderCreated` to the channel, and the
// document describes no traffic.
@channel("orders.created")
interface OrderChannel {
  op publish(event: OrderCreated): void;
}
```

The rule stays quiet in two cases. A channel with no messages is reported by [`channel-no-messages`](./diagnostics) instead. A channel that only receives replies through `@replyChannel` owns no operation by design.

**Fix:** add `@send` or `@receive` to the operations on the channel.

### `operation-without-message`

In `recommended`.

> Operation '\<name\>' names no `@message` model, so the emitted operation carries no `messages` field.

AsyncAPI reads an operation with no `messages` field as carrying **every message of its channel**. An empty list says the opposite, so the emitter leaves the field out rather than emitting one.

A model that no `@message` marks is a payload or a channel parameter. It contributes no message. An operation built only from such models therefore claims every message on its channel.

```typespec
// Reports. `publish` names no message, so it claims `OrderCreated`.
@channel("orders.{id}")
interface OrderChannel {
  @receive
  op consume(event: OrderCreated): void;

  @send
  op publish(id: string): void;
}
```

**Fix:** mark the model this operation carries with `@message`.

### `server-protocol-mismatch`

In `recommended`.

> This '\<binding\>' server binding names a protocol no server here speaks.

A server binding is recorded against the namespace, so every `@server` the namespace declares receives it. When the binding matches none of those servers, the document configures a connection with settings from a different protocol.

```typespec
// Reports. The document says MQTT and configures Kafka.
@service(#{ title: "Orders" })
@server("prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
@kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
namespace Orders;
```

The rule accepts the secure transport of the same protocol. `kafka-secure` is Kafka, and `smf` is Solace.

A namespace that declares servers of several protocols is not reported when one of them matches. The binding reaches all of them, and that is what the source asks for.

**Fix:** change the `protocol` of the `@server`, or remove the binding.

### `protobuf-content-type-undeclared`

In `recommended`. It only runs when [`preview-features`](./emitter-options#preview-features) names `protobuf`.

> Message '\<name\>' declares the content type '\<contentType\>', but nothing gives it a Protobuf payload.

`@contentType` states how the bytes on the wire are encoded. It does not produce them. So a message can name a Protobuf media type while its payload is still lowered from the TypeSpec model. The document then tells a consumer to decode Protobuf and describes those same bytes with a JSON Schema.

```typespec
// Reports. The content type says Protobuf, and the payload is JSON Schema.
@Protobuf.package({ name: "com.example.orders" })
namespace Orders {
  @message
  @contentType("application/vnd.google.protobuf")
  model OrderPlaced {
    id: string;
  }
}
```

Two things give a message a Protobuf payload, and either one silences the rule. `@Protobuf.message` with a `@Protobuf.field` on every property lets the preview feature render the schema. `@rawPayload` carries the text the author wrote.

The rule reads the media type and ignores what follows a semicolon, so a `;version=3` parameter does not hide the mistake. `application/vnd.google.protobuf`, `application/x-protobuf`, `application/protobuf` and `application/octet-stream+protobuf` all count.

**Fix:** add `@Protobuf.message` and a `@Protobuf.field` on every property, or write the schema with `@rawPayload`.

### `avro-content-type-undeclared`

In `recommended`. It only runs when [`preview-features`](./emitter-options#preview-features) names `avro`.

> Message '\<name\>' declares the content type '\<contentType\>', but nothing gives it an Avro payload.

`@contentType` states how the bytes on the wire are encoded. It does not produce them. So a message can name an Avro media type while its payload is still lowered from the TypeSpec model. The document then tells a consumer to decode Avro and describes those same bytes with a JSON Schema.

```typespec
// Reports. The content type says Avro, and the payload is JSON Schema.
@Avro.`namespace`("com.example.orders")
namespace Orders {
  @message
  @contentType("application/vnd.apache.avro")
  model OrderPlaced {
    id: string;
  }
}
```

Two things give a message an Avro payload, and either one silences the rule. `@Avro.record` lets the preview feature render the schema. `@rawPayload` carries the schema the author wrote.

The rule reads the media type and ignores what follows a semicolon, so a `;version=1.9.0` parameter does not hide the mistake. `application/vnd.apache.avro`, `application/vnd.apache.avro+json` and `application/vnd.apache.avro+yaml` all count.

**Fix:** add `@Avro.record`, or write the schema with `@rawPayload`.

### `unused-security-scheme`

Not in `recommended`. Enable it by name.

> Security scheme '\<name\>' is declared but no `@useSecurity` names it.

The emitter writes every `@securityScheme` into `components.securitySchemes`, whether or not anything names it. `@useSecurity` is what puts a scheme on a server.

This rule is outside `recommended` because a scheme nothing names is a real intention. `components.securitySchemes` is a registry, and a document may publish an authentication method that no channel requires yet.

```typespec
// Reports when the rule is on. Nothing asks for `kafka-scram`.
@service(#{ title: "Orders" })
@securityScheme("kafka-scram", #{ type: "scramSha512" })
@server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
namespace Orders;
```

**Fix:** apply `@useSecurity` to a namespace that declares a server, or remove the scheme.

## What the linter does not do

The linter does not repeat the diagnostics. The emitter reports 103 of them, and 49 of those wait until it runs.

Mirroring one as a rule would put the same check in two places, and the two would drift. It would also change the severity: 15 of the emit-time codes are errors, and a rule can only be a warning.

So the rules above cover mistakes that no diagnostic covers.
