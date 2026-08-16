# 08 — A Kafka user-signup contract

One realistic contract for one domain. The earlier examples show each feature
on its own. This one puts them together in a document you can copy and adapt.

## What it shows

- Two Kafka brokers, `kafka-dev` and `kafka-prod`, behind server variables.
- SASL/SCRAM and OAuth2 security schemes, required on every server.
- A versioned topic address parameterised by tenant.
- A base envelope, three event subtypes, and a `@discriminator`.
- An `@oneOf` union of the three subtypes.
- Correlation and tracing headers lifted out of the payload.
- One `@send` operation and one `@receive` operation, each with its own
  operation id and its own security.
- Two named message examples.
- Tags on `info` and on the message.
- All four Kafka bindings: server, channel, operation, and message.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/08-kafka-user-signup
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

The document lands in `asyncapi.yaml`, beside `main.tsp`. That file is
committed, so you can read the output without running anything.

## How the document is put together

### The connection side

Both servers hold a `{var}` template in `host`. Each declares the variable it
uses. A declared variable that no template uses is reported as
`unused-server-variable`.

`@useSecurity` names the two schemes. The emitter writes a `security` array on
every server of the namespace. AsyncAPI reads that array as OR, so a client
satisfies one of the two schemes.

The two requirements above are server-wide. `@useSecurity` also targets an
operation, and `publishSignupEvent` below carries one. An operation's
requirement is added to the server's rather than replacing it. The emitter
never copies the server schemes into the operation array, so a client
satisfies both arrays.

### The address

The address is `signup.v1.{tenantId}.events`. The version sits in the address,
not in the payload. A breaking change gets a new address and a new channel.

`{tenantId}` is matched against the `tenantId` parameter of the `publish`
operation. `@parameterLocation` says where the value sits at runtime.

### The operations

The channel carries two operations. `publish` is the producer, and `consume`
is the analytics pipeline that reads the same topic.

`@send("publishSignupEvent")` marks the operation and sets its key in the
emitted `operations` map. Without the argument the key would be `publish`, the
bare name of the operation. That key is document-wide, so a bare `publish`
would collide with any other operation of the same name.

The parameters of a `@send` operation are the messages it sends, plus the
address parameters. `event` carries `@message`, so it is the message.
`tenantId` does not, so it is an address parameter.

`consume` carries `@receive("consumeSignupEvent")`. For `@receive` the return
type is the messages received, so `SignupMessage` sits in the return type.
`tenantId` carries no `@message`, so it stays an address parameter. That rule
holds under either action.

`@useSecurity("signup-oauth")` on the operation adds one entry to that
operation's own `security` array. Both operations carry it.

```yaml
operations:
  publishSignupEvent:
    action: send
    channel:
      $ref: "#/channels/SignupFunnel"
    security:
      - $ref: "#/components/securitySchemes/signup-oauth"
    messages:
      - $ref: "#/channels/SignupFunnel/messages/SignupEventV1"
```

A message reference addresses the `messages` map of the channel, so it uses
the message key `SignupEventV1` that `@message` set.

### The events

`SignupEvent` is the envelope. Every event carries `eventId`, `occurredAt`,
`userId` and `tenantId`. The three subtypes extend it, so each emits `allOf`
with a `$ref` to the envelope.

`@discriminator("eventType")` names the property that tells the subtypes
apart. Each subtype narrows `eventType` to one literal.

`SignupEventEnvelope` is the union of the three. `@oneOf` emits `oneOf`, which
means exactly one branch matches. That is correct here, because no two
subtypes share an `eventType`.

### The message

`@message("SignupEventV1")` sets the `components.messages` key. The model name
stays `SignupMessage`.

Three fields carry `@header`. The emitter lifts them out of the payload schema
and into the message `headers` schema. Each key there is the field's wire
name, which `@encodedName` sets. The remaining fields form the payload, and
that payload schema is named `SignupMessagePayload`.

`@correlationId` points at the `correlation-id` header. The emitter checks the
shape of the runtime expression. It does not check that the pointer names a
declared field.

### The Kafka bindings

AsyncAPI puts protocol detail in a `bindings` object. It sits on a server, a
channel, an operation, and a message. This document carries one on each of the
four. Every Kafka binding is written with `bindingVersion: 0.5.0`, and the
value cannot be changed through a decorator.

Each decorator lists its own fields in
[the bindings reference](../../docs/reference/bindings.md). Read that page for
the field names, the types, and the legal values.

Each decorator also has one target. The paragraphs below name it. A decorator
on the wrong target reports `binding-outside-document`, which is a warning.
The document still emits, and the binding is missing from it.

The four decorators depend on each other in one place. The message binding
below sets `schemaIdLocation`, `schemaIdPayloadEncoding` and
`schemaLookupStrategy`. AsyncAPI forbids those three fields without a
server-level `schemaRegistryUrl`. So the server binding has to come first, and
its registry URL is not optional here. The emitter does not check the rule,
because it spans two objects of the document.

`@kafkaServer` names the schema registry. Apply it to the service namespace.
Every server of that namespace gets its own copy. `@server` is repeatable and
keyed by name, so no decorator target can single one server out. Both brokers
here are Kafka, so one registry for both is truthful.

`@kafkaChannel` states the layout of the topic. Apply it to the interface or
namespace that carries `@channel` or `@dynamicChannel`. It sets `partitions`,
`replicas` and `topicConfiguration`. It sets no `topic`, on purpose. The
address is `signup.v1.{tenantId}.events`, so one literal topic name cannot be
written down at design time. Set `topic` only when the address is a fixed
string, or when the topic name differs from the address.

`topicConfiguration` is an open map, because Kafka names its topic settings
with dots. The emitter checks one entry only. Each value of `cleanup.policy`
must be `delete` or `compact`.

`@kafkaOperation` carries `groupId` and `clientId`. Apply it to an operation
that carries `@send` or `@receive`. Both fields are Schema Objects,
written as object literals. `publish` sets `clientId` alone, because a
producer joins no consumer group. `consume` sets both, because it is the one
operation that reads under a group.

`@kafkaMessage` sets `key`, the partition key of the record. Apply it to a
model that carries `@message`. The key here is
the tenant id. Kafka orders records per partition, so one key per tenant keeps
the events of one tenant in order. That is what the partition count above is
for.

```yaml
bindings:
  kafka:
    key:
      type: string
      description: The tenant the event belongs to.
    schemaIdLocation: payload
    schemaIdPayloadEncoding: confluent
    schemaLookupStrategy: TopicIdStrategy
    bindingVersion: 0.5.0
```

## Previous

Read [07-request-and-reply](../07-request-and-reply/) for the request and
reply pattern on its own.

## Next

Read [09-protocol-bindings](../09-protocol-bindings/) when your protocol is
not Kafka. The generic `@binding` carries every other protocol.
