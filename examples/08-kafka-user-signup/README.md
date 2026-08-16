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
- One `@send` operation, with its own operation id and its own security.
- Two named message examples.
- Tags on `info` and on the message.

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

### The operation

`@send("publishSignupEvent")` marks the operation and sets its key in the
emitted `operations` map. Without the argument the key would be `publish`, the
bare name of the operation. That key is document-wide, so a bare `publish`
would collide with any other operation of the same name.

The parameters of a `@send` operation are the messages it sends, plus the
address parameters. `event` carries `@message`, so it is the message.
`tenantId` does not, so it is an address parameter.

`@useSecurity("signup-oauth")` on the operation adds one entry to that
operation's own `security` array.

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

## What this document cannot express yet

**Kafka bindings.** A production Kafka contract states the partition key, the
group id, the client id, and the schema registry it uses. AsyncAPI carries all
of those in `bindings.kafka`, on a channel, an operation, or a message. This
emitter has no binding decorator of any kind. Add the bindings by hand to the
emitted document.

## Previous

Read [07-request-and-reply](../07-request-and-reply/) for the request and
reply pattern on its own.
