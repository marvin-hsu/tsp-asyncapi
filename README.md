# tsp-asyncapi

| Package                                                                                                                | Version                                                                                                       | Downloads                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi) — the AsyncAPI 3.1 emitter                                | [![npm](https://img.shields.io/npm/v/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)           | [![downloads](https://img.shields.io/npm/dm/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)           |
| [`tsp-asyncapi-core`](https://www.npmjs.com/package/tsp-asyncapi-core) — the decorators and semantic model, no emitter | [![npm](https://img.shields.io/npm/v/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core) | [![downloads](https://img.shields.io/npm/dm/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core) |

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

> **Status: released on npm.** The emitter generates a complete AsyncAPI 3.1 document. Channels, operations, messages, schemas, servers, security schemes, and protocol bindings (including Kafka) are implemented and pass the official AsyncAPI validation. The current focus is test quality: a re-evaluation of the existing test cases, and more property-based test scenarios.

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

This is the output of the example above. The official AsyncAPI parser accepts it with no error:

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

An operation refers to a message through its channel, never through `components.messages`. AsyncAPI 3 requires that form.

## Examples

Fifteen worked examples live in [`examples/`](./examples/), each with its TypeSpec source and the AsyncAPI document the emitter wrote from it. Every protocol this library implements appears in at least one.

The [Examples page](https://marvin-hsu.github.io/tsp-asyncapi/guide/examples) says what each one shows.

## Emitter options

Set these in `tspconfig.yaml`, or pass them as CLI arguments:

| Option                 | Type       | Default         | Description                                                              |
| ---------------------- | ---------- | --------------- | ------------------------------------------------------------------------ |
| `output-file`          | `string`   | `asyncapi.yaml` | Name of the emitted file.                                                |
| `file-type`            | `string`   | `yaml`          | Format of the generated document: `yaml` or `json`.                      |
| `asyncapi-id`          | `string`   | -               | Global identifier for the document. Maps to the `id` field.              |
| `default-content-type` | `string`   | -               | Default content type for message payloads. Maps to `defaultContentType`. |
| `preview-features`     | `string[]` | `[]`            | Turns on preview features. The reserved names are `protobuf` and `avro`. |

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

A name collision between two declarations reports a diagnostic error. It does not rename either declaration automatically.

## Available decorators

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

## Linter

Five optional rules catch mistakes the emitter accepts. Each one produces a
valid document that says something you did not mean, and no diagnostic covers
any of them. A rule runs during semantic analysis, so an editor shows it
without running the emitter.

```yaml
# tspconfig.yaml
linter:
  extends:
    - "tsp-asyncapi/recommended"
```

`recommended` enables `missing-service`, `channel-without-operation`,
`operation-without-message`, and `server-protocol-mismatch`.
`unused-security-scheme` is enabled by name. See the Linter reference on the
docs site for what each rule catches and how to fix it.

## Feature Status & Design Decisions

Measured against the AsyncAPI 3.0 JSON schema on 2026-08-17. The `channel`,
`server` and `info` objects carry every field the specification defines.
Each remaining gap is a decision rather than an oversight. The gaps fall
into three groups: planned, waiting for a use case, and will not do.

`components` carries eleven of its nineteen sections. A fragment the author
named is written there on its first use. A fragment with no name of its own
is written there when a second place carries the same one. See the Reusable
Components reference on the docs site for the two rules and how a component
is named.

### Planned

| Planned work                                 | What it means today                                                                                                                                                                                  | Notes                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| First-class support for `@typespec/protobuf` | One source compiles with both emitters today. A protobuf payload reaches the document through `@rawPayload`, written by hand. A `Protobuf.Map` and an `Extern` model lower to a bare `type: object`. | The emitter must take the protobuf schema from the generated `.proto`. `@typespec/protobuf` exports no accessor for `@field` or `@package` today. |
| An Avro emitter                              | Avro reaches the document through `@rawPayload`, written by hand. Nothing builds an Avro schema from a TypeSpec model.                                                                               | A separate package. The AsyncAPI emitter inlines what that package writes.                                                                        |

### Waiting for a use case

| Item                   | Why it can wait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | What would change the decision                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@typespec/versioning` | Inline versioning with decorators often reduces readability. The current decorators also suffer from edge-case bugs in TypeSpec ([#3649](https://github.com/microsoft/typespec/issues/3649), [#7035](https://github.com/microsoft/typespec/issues/7035)), and the core team plans to redesign the system using a new `when` syntax ([#10551](https://github.com/microsoft/typespec/issues/10551)), eventually deprecating the decorators. Until then, managing versions via Git branches or directories is a safer alternative. | The TypeSpec core team stabilizing the new `when` syntax, alongside clear user demand for multi-version document generation. |

### Will not do

| Item                                                                | Why not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `traits` on a message and an operation                              | A trait deduplicates the emitted document, not the source. TypeSpec already provides reuse at the source level with `extends`, `is`, and spread. The emitter writes the merged result, so a reader never resolves a trait chain.                                                                                                                                                                                                                                                                         |
| More than one `@service`                                            | An AsyncAPI document describes one application. To describe several applications, give each one its own entry-point project and share the TypeSpec sources between them. Generating multiple top-level clients from a single project is an acknowledged architectural pain point in TypeSpec (see [#7120](https://github.com/microsoft/typespec/issues/7120), [#9032](https://github.com/microsoft/typespec/issues/9032)). Today the first service is emitted and `multiple-services` reports the rest.  |
| Splitting one AsyncAPI document across files, and cross-file `$ref` | TypeSpec already provides excellent file splitting and organization at the source level, so there is typically no need to split the final output document. However, once the official EFv2 (Emitter Framework v2) matures, implementing multi-file output may be reconsidered. This is about one document becoming several files. It says nothing about an emitter that writes several files by nature, such as one generating source code: that emitter is a separate package and is not bound by this. |

The [diagnostics reference](https://marvin-hsu.github.io/tsp-asyncapi/reference/diagnostics) lists every code the emitter reports, so anything it cannot represent is reported rather than dropped in silence.

### One exception, in the compiler

A member named `__proto__` never reaches this emitter. The compiler marshals
an object value by assigning each member in turn. In JavaScript, an
assignment to `__proto__` sets the prototype of the object. It does not add a
member. So the member is lost before any decorator runs, and nothing reports
it.

```typespec
// The emitter receives one member, `ok`. The other one is gone.
@extension("x-thing", #{ `__proto__`: "written", ok: 1 })
```

When the lost member holds an object or an array, that value also becomes the
prototype of the marshalled object. Reading a name the author never declared
can then return the author's data.

Every decorator that takes an object value is affected, `@extension` and
`@binding` among them. This emitter cannot recover the member, because the
value arrives already changed.

Do not use `__proto__` as a member name. This is reported upstream as
[microsoft/typespec#11743](https://github.com/microsoft/typespec/issues/11743).
`test/unit/extensions.test.ts` carries the case as `it.fails`, so it turns
green if the compiler stops losing the name.

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
