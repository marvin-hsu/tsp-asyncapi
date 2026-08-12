# typespec-asyncapi

An [AsyncAPI 3.1](https://www.asyncapi.com/) emitter for [TypeSpec](https://typespec.io/) — describe your event-driven APIs (Kafka, MQTT, WebSocket, …) in TypeSpec and emit AsyncAPI documents from a single source of truth.

> **Status: Work in progress.** This project currently supports generating the Document Skeleton, Info metadata, Tags, ExternalDocs, and **Basic Schemas** (Models, Scalars, Arrays, Records) for AsyncAPI 3.1.0. Channel, Operation, and Message mapping are under active development.

## Why

TypeSpec has first-class emitters for OpenAPI, but the AsyncAPI story for event-driven contracts (message queues, streaming topics) is still young. This project explores building that emitter, so HTTP and async contracts can live side by side in one TypeSpec workspace.

## Installation

This package is currently under development. To try it locally:

```bash
git clone <this repo>
cd typespec-asyncapi
pnpm install
pnpm build
```

Then reference it from your TypeSpec project via a local file dependency or `pnpm link`.

## Usage

Add the library to your `main.tsp` and use the provided decorators to annotate your service:

```typespec
import "typespec-asyncapi";

using AsyncAPI;

@service(#{ title: "Order Service API" })
@info(#{
  version: "1.0.0",
  description: "This is a sample Order Service event-driven API.",
  contact: #{ name: "API Support", email: "support@example.com" },
  license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
})
@tag("orders")
@tag("payment")
@externalDocs("https://example.com/docs", "Service Documentation")
namespace Orders;

// Standard TypeSpec models are automatically converted to AsyncAPI Schema Objects
// and placed in components.schemas
model Order {
  id: string;
  amount: float64;
  items: OrderItem[];
  metadata: Record<string>;
}

model OrderItem {
  productId: string;
  quantity: int32;
}
```

Configure the emitter in your `tspconfig.yaml`:

```yaml
emit:
  - "typespec-asyncapi"
options:
  "typespec-asyncapi":
    output-file: "asyncapi.yaml"
    file-type: "yaml"
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

Then compile:

```bash
tsp compile . --emit typespec-asyncapi
```

This will generate a fully compliant AsyncAPI 3.1.0 document.

## Emitter Options

You can configure the emitter using the following options in `tspconfig.yaml` or via CLI arguments:

| Option                 | Type     | Default         | Description                                                                  |
| ---------------------- | -------- | --------------- | ---------------------------------------------------------------------------- |
| `output-file`          | `string` | `asyncapi.yaml` | Name of the emitted file.                                                    |
| `file-type`            | `string` | `yaml`          | Format of the generated document (`yaml` or `json`).                         |
| `asyncapi-id`          | `string` | -               | Global identifier for the AsyncAPI document (`id` field).                    |
| `default-content-type` | `string` | -               | Default content type used for message payloads (`defaultContentType` field). |

## Available Decorators

- `@AsyncAPI.info` - Sets the full AsyncAPI `info` block including version, description, contact, and license.
- `@AsyncAPI.externalDocs` - Attaches external documentation links.
- `@tag` - (Built-in) Adds standard tags to your AsyncAPI document.
- `@service` - (Built-in) Extracts the API title automatically.

## Development

```bash
pnpm install        # install dependencies
pnpm build          # compile TypeScript to dist/
pnpm test           # run tests (vitest)
pnpm lint           # eslint
pnpm format         # prettier
pnpm docs           # generate API docs (typedoc)
```
