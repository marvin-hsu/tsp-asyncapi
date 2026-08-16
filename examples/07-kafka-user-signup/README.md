# 07 — A Kafka user-signup contract

One realistic contract for one domain. The earlier examples show each feature
on its own. This one puts them together in a document you can copy and adapt.

## What it shows

- Two Kafka brokers, `kafka-dev` and `kafka-prod`, behind server variables.
- SASL/SCRAM and OAuth2 security schemes, required on every server.
- A versioned topic address parameterised by tenant.
- A base envelope, three event subtypes, and a `@discriminator`.
- An `@oneOf` union of the three subtypes.
- Correlation and tracing headers lifted out of the payload.
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
cd examples/07-kafka-user-signup
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

Every requirement here is server-wide. `@useSecurity` also applies to an
operation, where the requirement is added to the server's rather than
replacing it. This example does not show that.

### The address

The address is `signup.v1.{tenantId}.events`. The version sits in the address,
not in the payload. A breaking change gets a new address and a new channel.

`{tenantId}` is matched against the `tenantId` parameter of the `publish`
operation. `@parameterLocation` says where the value sits at runtime.

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

Two parts of a production AsyncAPI document are missing, and no example in
this directory can add them.

**The `operations` object.** The emitted document carries `operations: {}`
because no operation here is marked with `@send` or `@receive`. Both exist and
do emit operations; this example has not been extended to use them. Without
them a TypeSpec operation still declares which messages a channel carries and
which address parameters it has.

**Kafka bindings.** A production Kafka contract states the partition key, the
group id, the client id, and the schema registry it uses. AsyncAPI carries all
of those in `bindings.kafka`, on a channel, an operation, or a message. This
emitter has no binding decorator of any kind. Add the bindings by hand to the
emitted document, or wait for binding support.

## Previous

Read [06-servers-and-security](../06-servers-and-security/) for servers and
security schemes on their own.
