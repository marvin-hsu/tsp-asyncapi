# tsp-asyncapi

| Package                                                                                                                | Version                                                                                                       | Downloads                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi) — the AsyncAPI 3.1 emitter                                | [![npm](https://img.shields.io/npm/v/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)           | [![downloads](https://img.shields.io/npm/dm/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)           |
| [`tsp-asyncapi-core`](https://www.npmjs.com/package/tsp-asyncapi-core) — the decorators and semantic model, no emitter | [![npm](https://img.shields.io/npm/v/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core) | [![downloads](https://img.shields.io/npm/dm/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core) |
| [`tsp-avro`](https://www.npmjs.com/package/tsp-avro) — an Apache Avro schema emitter, experimental                     | [![npm](https://img.shields.io/npm/v/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)                   | [![downloads](https://img.shields.io/npm/dm/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)                   |

[![Node.js](https://img.shields.io/node/v/tsp-asyncapi)](https://nodejs.org/)
[![GitHub stars](https://img.shields.io/github/stars/marvin-hsu/tsp-asyncapi.svg?style=flat)](https://github.com/marvin-hsu/tsp-asyncapi/stargazers)

[![CI](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/ci.yml/badge.svg)](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/ci.yml)
[![Release](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/release.yml/badge.svg?event=workflow_dispatch)](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/release.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=coverage)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=bugs)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<a href='https://ko-fi.com/N4R6257TGG' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

[English](./README.md) | [繁體中文](./README.zh-TW.md)

An [AsyncAPI 3.1](https://www.asyncapi.com/) emitter for [TypeSpec](https://typespec.io/). Describe an event-driven API in TypeSpec and emit a full AsyncAPI document.

> **Status: released on npm.** The emitter writes a complete AsyncAPI 3.1 document.
>
> - **Implemented:** channels, operations, messages, schemas, servers, security schemes, and protocol bindings including Kafka. The official AsyncAPI validator accepts the output.
> - **Preview features:** Protobuf payloads and Avro payloads.
> - **Pre-1.0:** all three packages. A minor release can still change what they emit.

> **Note:** This project uses direct AST traversal rather than the legacy `@typespec/asset-emitter`. The TypeSpec core team is transitioning away from this old emitter framework (EFv1) in favor of EFv2 (see [#5998](https://github.com/microsoft/typespec/issues/5998) and [#6583](https://github.com/microsoft/typespec/issues/6583)).

📖 **Documentation: see the [docs site](https://marvin-hsu.github.io/tsp-asyncapi/)** — getting started, verified schema-conversion examples, and the full decorator/options/diagnostics reference, in English and Traditional Chinese.

## Requirements

- Node.js >= 20
- [pnpm](https://pnpm.io/) (this repo's `devEngines` field pins ^11)

## Installation

Install the emitter in your TypeSpec project:

```bash
pnpm add tsp-asyncapi
```

Installing `tsp-asyncapi` brings `tsp-asyncapi-core` with it. You do not normally install that one yourself.

If you need the Avro emitter:

```bash
pnpm add tsp-avro
```

## Usage

Add the library to your `main.tsp` and annotate your service with the provided decorators:

```typespec
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Order Service API" })
@info(#{ version: "1.0.0", description: "A sample event-driven order API." })
@securityScheme("kafka-scram", #{ type: "scramSha512" })
@useSecurity("kafka-scram")
@server("production", #{ host: "kafka.example.com:9092", protocol: "kafka-secure" })
namespace Orders;

@message
@doc("An order a customer placed.")
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
  amount: float64;
}

@channel("orders.created")
@doc("Every order a customer places lands here.")
@useServer("production")
interface OrderChannel {
  @send
  @summary("Publish an order event")
  op sendOrderCreated(event: OrderCreated): void;

  @receive
  @summary("Consume an order event")
  op onOrderCreated(): OrderCreated;
}
```

Configure the emitter in `tspconfig.yaml`:

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    output-file: "asyncapi.yaml"
    file-type: "yaml"
```

Then compile:

```bash
tsp compile . --emit tsp-asyncapi
```

The output:

```yaml
asyncapi: 3.1.0
info:
  title: Order Service API
  version: 1.0.0
  description: A sample event-driven order API.
servers:
  production:
    host: kafka.example.com:9092
    protocol: kafka-secure
    security:
      - $ref: "#/components/securitySchemes/kafka-scram"
channels:
  orders.created:
    address: orders.created
    description: Every order a customer places lands here.
    servers:
      - $ref: "#/servers/production"
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
operations:
  sendOrderCreated:
    action: send
    channel:
      $ref: "#/channels/orders.created"
    title: Publish an order event
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/orders.created"
    title: Consume an order event
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
components:
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
        amount:
          type: number
          format: double
      required:
        - orderId
        - amount
      description: An order a customer placed.
  messages:
    OrderCreated:
      name: OrderCreated
      description: An order a customer placed.
      headers:
        type: object
        properties:
          correlationId:
            type: string
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
  securitySchemes:
    kafka-scram:
      type: scramSha512
```

> **Note:** AsyncAPI 3 requires an operation to refer to a message through its channel, never through `components.messages`.

## Examples

Eighteen worked examples live in [`examples/`](./examples/), each with its TypeSpec source and the output an emitter wrote from it. Every protocol this library implements appears in at least one of them.

| Example                                                             | What it shows                                  |
| ------------------------------------------------------------------- | ---------------------------------------------- |
| [Hello world](./examples/01-hello-world/)                           | The smallest complete document                 |
| [Payload schemas](./examples/02-payload-schemas/)                   | Every schema shape, and its constraints        |
| [Schema composition](./examples/03-schema-composition/)             | Four ways to build a schema from others        |
| [Message metadata](./examples/04-message-metadata/)                 | Headers, correlation id, examples, tags        |
| [Channels and parameters](./examples/05-channels-and-parameters/)   | Channel ids, address templates, parameters     |
| [Servers and security](./examples/06-servers-and-security/)         | Servers, variables, security schemes           |
| [Request and reply](./examples/07-request-and-reply/)               | Both shapes of an AsyncAPI reply               |
| [Kafka user signup](./examples/08-kafka-user-signup/)               | A full Kafka contract, all four binding levels |
| [MQTT bindings](./examples/09-protocol-bindings/)                   | The MQTT bindings and the generic `@binding`   |
| [Streetlights](./examples/10-streetlights-kafka/)                   | The official AsyncAPI sample, in TypeSpec      |
| [Multiple protocols](./examples/11-multi-protocol/)                 | One payload over Kafka, WebSocket and SQS      |
| [HTTP callbacks](./examples/12-http-callbacks/)                     | The HTTP bindings on a webhook                 |
| [Enterprise brokers](./examples/13-enterprise-brokers/)             | AMQP, JMS, IBM MQ and Anypoint MQ              |
| [Streaming platforms](./examples/14-streaming-platforms/)           | NATS, Pulsar, Pub/Sub and Solace               |
| [Specification extensions](./examples/15-specification-extensions/) | The `x-` fields the specification leaves open  |
| [Protobuf payloads](./examples/16-protobuf-payloads/)               | Two Protobuf packages, `.proto` written too    |
| [Avro schemas](./examples/17-avro-schemas/)                         | `.avsc` files alone, no AsyncAPI document      |
| [Avro payloads](./examples/18-avro-payloads/)                       | Two Avro records, `.avsc` written too          |

The [Examples page](https://marvin-hsu.github.io/tsp-asyncapi/guide/examples) describes each one in more detail.

## Avro emitter

[`tsp-avro`](./packages/tsp-avro/) is an experimental package. It is pre-1.0, and any release can change its surface.

It mainly backs the `avro` preview feature of the AsyncAPI emitter: mark a model with `@Avro.avroRecord` and its payload comes out as an Avro schema. The [Avro Payloads guide](https://marvin-hsu.github.io/tsp-asyncapi/guide/avro-payloads) says how to turn it on.

It also stands alone: it declares its own decorators, so it writes `.avsc` files with no AsyncAPI decorator present. The [Avro Schemas guide](https://marvin-hsu.github.io/tsp-asyncapi/guide/avro-schemas) says how to use it.

## Emitter options

Set these in `tspconfig.yaml`, or pass them as CLI arguments:

| Option                 | Type       | Default         | Description                                                              |
| ---------------------- | ---------- | --------------- | ------------------------------------------------------------------------ |
| `output-file`          | `string`   | `asyncapi.yaml` | Name of the emitted file.                                                |
| `file-type`            | `string`   | `yaml`          | Format of the generated document: `yaml` or `json`.                      |
| `asyncapi-id`          | `string`   | -               | Global identifier for the document. Maps to the `id` field.              |
| `default-content-type` | `string`   | -               | Default content type for message payloads. Maps to `defaultContentType`. |
| `preview-features`     | `string[]` | `[]`            | Turns on preview features. The reserved names are `protobuf` and `avro`. |

## Preview features

> **Warning:** Anything a preview feature emits can change in a future release.

Turn one on with `preview-features` in `tspconfig.yaml`.

| Feature    | Payload format | Peer package         | Guide                                                                                  |
| ---------- | -------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `protobuf` | proto3 text    | `@typespec/protobuf` | [Protobuf payloads](https://marvin-hsu.github.io/tsp-asyncapi/guide/protobuf-payloads) |
| `avro`     | Avro schema    | `tsp-avro`           | [Avro payloads](https://marvin-hsu.github.io/tsp-asyncapi/guide/avro-payloads)         |

Both peer packages are optional and pinned to one minor range. A project that never turns the feature on never installs one.

Some TypeSpec constructs have no proto3 form: an anonymous model, a template instantiation, a union, an `@Protobuf.externRef`. A model that reaches one gets no payload, and the emitter reports which construct stopped it.

> **Note:** A model with a generated payload cannot use a field-level `@header`. Use `@headers` instead. Headers are always JSON Schema.

## Schema conversion

This emitter converts a TypeSpec model, scalar, enum, or union to an AsyncAPI Schema Object automatically. Supported constructs include:

- Models, including nested models, arrays, and `Record<T>`.
- Scalars, including TypeSpec's built-in numeric/string/date scalars and user-declared derived scalars.
- Enums and unions, including string-literal unions and `T | null`.
- Inheritance (`extends`) and `@discriminator`, mapped to `allOf` and a `discriminator` field.
- Validation keywords: `@minLength`, `@maxLength`, `@minValue`, `@maxValue`, `@minItems`, `@maxItems`, `@pattern`, and related decorators.
- Documentation: `@doc`, `@summary`, and `@example`.
- `@encodedName` for renaming a property's wire-format key.
- Stable, argument-derived names for template instantiations (for example, `Page<string>` becomes `PageString` in `components.schemas`).

A name collision between two declarations fails the compilation and asks you to rename one.

## Available decorators

There are two sets: AsyncAPI describes a document, Avro describes a schema file.

### AsyncAPI decorators

- `@AsyncAPI.info` — Sets the full AsyncAPI `info` block: version, description, contact, and license.
- `@AsyncAPI.externalDocs` — Attaches external documentation links.
- `@AsyncAPI.extension` — Adds one `x-` specification extension to the `info`, channel, operation, or message object the target emits. Repeatable; each application adds one key.
- `@AsyncAPI.oneOf` — Marks a union to emit `oneOf` instead of the default `anyOf`.
- `@AsyncAPI.jsonSchemaExtension` — Adds one JSON Schema keyword this emitter has no dedicated decorator for, e.g. `@jsonSchemaExtension("unevaluatedProperties", false)`. Repeatable; each application adds one key/value pair.
- `@AsyncAPI.channel` / `@AsyncAPI.dynamicChannel` — Declares one channel on an interface or a namespace.
- `@AsyncAPI.send` / `@AsyncAPI.receive` — Marks one operation as a message this application sends or receives.
- `@AsyncAPI.replyChannel` / `@AsyncAPI.replyAddress` — Describes the reply of an operation. See the Request and Reply guide on the docs site.
- `@AsyncAPI.message` — Marks a model as a message.
- `@AsyncAPI.server` / `@AsyncAPI.useServer` — Declares and references servers. Server variables are the `variables` field of the `@server` config, not a decorator of their own.
- `@AsyncAPI.securityScheme` / `@AsyncAPI.useSecurity` — Declares and applies security schemes.
- `@AsyncAPI.binding` — Adds generic protocol binding configurations.
- `@AsyncAPI.kafkaServer` / `@AsyncAPI.kafkaChannel` / `@AsyncAPI.kafkaOperation` / `@AsyncAPI.kafkaMessage` — Adds Kafka-specific binding configurations.
- `@AsyncAPI.websocketChannel` — Adds the WebSocket channel binding.
- `@AsyncAPI.mqttServer` / `@AsyncAPI.mqttOperation` / `@AsyncAPI.mqttMessage` — Adds the MQTT bindings.
- `@AsyncAPI.httpOperation` / `@AsyncAPI.httpMessage` — Adds the HTTP bindings.
- `@AsyncAPI.amqpChannel` / `@AsyncAPI.amqpOperation` / `@AsyncAPI.amqpMessage` — Adds the AMQP 0-9-1 bindings.
- `@AsyncAPI.natsOperation` — Adds the NATS operation binding.
- `@AsyncAPI.pulsarServer` / `@AsyncAPI.pulsarChannel` — Adds the Pulsar bindings.
- `@AsyncAPI.googlePubSubChannel` / `@AsyncAPI.googlePubSubMessage` — Adds the Google Cloud Pub/Sub bindings.
- `@AsyncAPI.sqsChannel` / `@AsyncAPI.sqsOperation` — Adds the Amazon SQS bindings.
- `@AsyncAPI.anypointMqChannel` / `@AsyncAPI.anypointMqMessage` — Adds the Anypoint MQ bindings.
- `@AsyncAPI.jmsServer` / `@AsyncAPI.jmsChannel` / `@AsyncAPI.jmsMessage` — Adds the JMS bindings.
- `@AsyncAPI.ibmMqServer` / `@AsyncAPI.ibmMqChannel` / `@AsyncAPI.ibmMqMessage` — Adds the IBM MQ bindings.
- `@AsyncAPI.solaceServer` / `@AsyncAPI.solaceOperation` — Adds the Solace bindings.
- `@tag` — Built-in. Adds standard tags to the document.
- `@service` — Built-in. Extracts the API title automatically.

### Avro decorators

From [`tsp-avro`](./packages/tsp-avro/). A plain TypeSpec model is already a
valid Avro record, so these cover what Avro has and TypeSpec cannot say.

- `@Avro.avroNamespace` — Declares the Avro namespace of a namespace. The nearest ancestor that declares one wins, and it becomes the directory a `.avsc` file is written into.
- `@Avro.avroRecord` — Marks a model to emit. One marked model becomes one `.avsc` file.
- `@Avro.aliases` — Names what a declaration used to be called, so a reader written against the old name still resolves it.
- `@Avro.order` — Sets the sort order of a field: `ascending`, `descending` or `ignore`.
- `@Avro.fixed` — Makes an Avro `fixed` type of that many bytes.
- `@Avro.logicalType` — Writes one of the logical types the specification defines, such as `uuid` or `timestamp-millis`.
- `@Avro.decimal` — Sets the precision and the scale of a `decimal`.
- `@Avro.enumDefault` — Names the member a reader takes when it meets a symbol the enum does not declare.

A model that carries `@Avro.avroRecord` and `@AsyncAPI.message` also gets an
Avro payload in the document, when the `avro` preview feature is on.

## Linter

A rule runs during semantic analysis, so an editor shows it without running
the emitter.

```yaml
# tspconfig.yaml
linter:
  extends:
    - "tsp-asyncapi/recommended"
```

| Rule                               | In `recommended` | Catches                                                      |
| ---------------------------------- | :--------------: | ------------------------------------------------------------ |
| `missing-service`                  |        ✓         | AsyncAPI content with no `@service` declaration.             |
| `channel-without-operation`        |        ✓         | A channel with no `@send` or `@receive` operation.           |
| `operation-without-message`        |        ✓         | An operation that names no `@message` model.                 |
| `server-protocol-mismatch`         |        ✓         | A server binding whose protocol does not match the server's. |
| `protobuf-content-type-undeclared` |        ✓         | A Protobuf content type with no Protobuf payload to back it. |
| `avro-content-type-undeclared`     |        ✓         | An Avro content type with no Avro payload to back it.        |
| `unused-security-scheme`           |                  | A declared security scheme no `@useSecurity` names.          |

See the [Linter reference](https://marvin-hsu.github.io/tsp-asyncapi/reference/linter) on the docs site for each rule's message and fix.

## Design tradeoffs

| Item                                 | Supported | Why                                                                                                                                                  |
| ------------------------------------ | :-------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typespec/versioning`               |    TBD    | Waiting on the `when`-based redesign ([#10551](https://github.com/microsoft/typespec/issues/10551)). Suggest Git branches or directories until then. |
| `traits`                             |     ✗     | `extends`, `is`, and spread already cover reuse in TypeSpec, and the emitter writes the merged result.                                               |
| More than one `@service`             |     ✗     | One application per document is enough in practice. Give each application its own project; only the first `@service` emits.                          |
| Multi-file output, cross-file `$ref` |     ✗     | TypeSpec splits at the source level, so the compiled document does not need splitting too.                                                           |

See the [diagnostics reference](https://marvin-hsu.github.io/tsp-asyncapi/reference/diagnostics) for every code. Anything the emitter cannot represent is reported.

## Upstream bug

> **Warning:** Do not use `__proto__` as a member name.

The compiler marshals an object value by assigning each member in turn. In
JavaScript, an assignment to `__proto__` sets the prototype of the object
rather than adding a member, so the member is lost before any decorator
runs, with no error or warning.

```typespec
// The emitter receives one member, `ok`. The other one is gone.
@extension("x-thing", #{ `__proto__`: "written", ok: 1 })
```

When the lost member holds an object or an array, that value becomes the
prototype of the marshalled object instead. Reading a name the author never
declared can then return that smuggled-in data.

Every decorator that takes an object value is affected, `@extension` and
`@binding` among them. The value has already been changed by the time the
emitter sees it, so nothing here can recover the member.

Tracked upstream at [microsoft/typespec#11743](https://github.com/microsoft/typespec/issues/11743).

## Development

```bash
pnpm install        # Install dependencies.
pnpm build          # Compile TypeScript to dist/.
pnpm watch          # Compile in watch mode.
pnpm test           # Run tests (vitest).
pnpm lint           # Run eslint.
pnpm format         # Run prettier.
pnpm docs:dev       # Run the documentation site locally (VitePress).
pnpm docs:build     # Build the documentation site.
```

The documentation site lives in `docs/` and is built with [VitePress](https://vitepress.dev/), in English and Traditional Chinese. Pushes to `main` deploy it to GitHub Pages.

Other tools in this repo:

- **api-extractor** — Tracks the public API surface (`pnpm api-extractor:local`).
- **knip** — Finds unused code and dependencies (`pnpm knip`).
- **husky + lint-staged** — Runs lint and format checks before each commit.

## License

[MIT](./LICENSE)
