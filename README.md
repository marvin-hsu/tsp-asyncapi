# tsp-asyncapi

[![npm version](https://img.shields.io/npm/v/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)
[![Node.js](https://img.shields.io/node/v/tsp-asyncapi)](https://nodejs.org/)
[![npm downloads](https://img.shields.io/npm/dm/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)
[![GitHub stars](https://img.shields.io/github/stars/marvin-hsu/tsp-asyncapi.svg?style=flat)](https://github.com/marvin-hsu/tsp-asyncapi/stargazers)

[![CI](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/ci.yml/badge.svg)](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/ci.yml)
[![Release](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/release.yml/badge.svg)](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/release.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=alert_status&token=05333b1ef366281e4d0f053bda42ff49360439df)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=coverage&token=05333b1ef366281e4d0f053bda42ff49360439df)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=code_smells&token=05333b1ef366281e4d0f053bda42ff49360439df)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=bugs&token=05333b1ef366281e4d0f053bda42ff49360439df)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<a href="https://www.buymeacoffee.com/2wytm9xsqfr"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=2wytm9xsqfr&button_colour=FFDD00&font_colour=000000&font_family=Cookie&outline_colour=000000&coffee_colour=ffffff" /></a>

[English](./README.md) | [繁體中文](./README.zh-TW.md)

An [AsyncAPI 3.1](https://www.asyncapi.com/) emitter for [TypeSpec](https://typespec.io/). Describe an event-driven API in TypeSpec and emit a full AsyncAPI document.

> **Status: nearing initial release (M4).** The emitter generates a complete AsyncAPI 3.1 document. Channels, operations, messages, schemas, servers, security schemes, and protocol bindings (including Kafka) are implemented and pass the official AsyncAPI validation. Multi-file output and component reuse via `$ref` across files are still in development.

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
  OrderChannel:
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
      $ref: "#/channels/OrderChannel"
    title: Publish an order event
    messages:
      - $ref: "#/channels/OrderChannel/messages/OrderCreated"
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/OrderChannel"
    title: Consume an order event
    messages:
      - $ref: "#/channels/OrderChannel/messages/OrderCreated"
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

## Emitter options

Set these in `tspconfig.yaml`, or pass them as CLI arguments:

| Option                 | Type     | Default         | Description                                                              |
| ---------------------- | -------- | --------------- | ------------------------------------------------------------------------ |
| `output-file`          | `string` | `asyncapi.yaml` | Name of the emitted file.                                                |
| `file-type`            | `string` | `yaml`          | Format of the generated document: `yaml` or `json`.                      |
| `asyncapi-id`          | `string` | -               | Global identifier for the document. Maps to the `id` field.              |
| `default-content-type` | `string` | -               | Default content type for message payloads. Maps to `defaultContentType`. |

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
- `@AsyncAPI.oneOf` — Marks a union to emit `oneOf` instead of the default `anyOf`.
- `@AsyncAPI.jsonSchemaExtension` — Adds one JSON Schema keyword this emitter has no dedicated decorator for, e.g. `@jsonSchemaExtension("unevaluatedProperties", false)`. Repeatable; each application adds one key/value pair.
- `@AsyncAPI.channel` / `@AsyncAPI.dynamicChannel` — Declares one channel on an interface or a namespace.
- `@AsyncAPI.send` / `@AsyncAPI.receive` — Marks one operation as a message this application sends or receives.
- `@AsyncAPI.replyChannel` / `@AsyncAPI.replyAddress` — Describes the reply of an operation. See the Request and Reply guide on the docs site.
- `@AsyncAPI.message` — Marks a model as a message.
- `@AsyncAPI.server` / `@AsyncAPI.useServer` / `@AsyncAPI.serverVariable` — Declares and references servers.
- `@AsyncAPI.securityScheme` / `@AsyncAPI.useSecurity` — Declares and applies security schemes.
- `@AsyncAPI.binding` — Adds generic protocol binding configurations.
- `@AsyncAPI.kafkaServer` / `@AsyncAPI.kafkaChannel` / `@AsyncAPI.kafkaOperation` / `@AsyncAPI.kafkaMessage` — Adds Kafka-specific binding configurations.
- `@tag` — Built-in. Adds standard tags to the document.
- `@service` — Built-in. Extracts the API title automatically.

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
