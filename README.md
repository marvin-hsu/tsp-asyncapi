# tsp-asyncapi

[English](./README.md) | [繁體中文](./README.zh-TW.md)

An [AsyncAPI 3.1](https://www.asyncapi.com/) emitter for [TypeSpec](https://typespec.io/). Describe an event-driven API in TypeSpec. Emit a full AsyncAPI document from one source of truth.

> **Status: work in progress.** The emitter generates the document skeleton and `info` metadata (title, version, contact, license, tags, external docs). The TypeSpec-to-AsyncAPI-schema conversion layer (models, scalars, arrays, records, enums, unions, inheritance, discriminators, and validation keywords) is implemented and unit-tested, but is not yet wired into the emitted file — it lands together with message payloads. Channels, operations, messages, servers, security, and protocol bindings are still in development.

📖 **Documentation: see the [docs site](https://marvin-hsu.github.io/tsp-asyncapi/)** — getting started, verified schema-conversion examples, and the full decorator/options/diagnostics reference, in English and Traditional Chinese.

## Why

TypeSpec has a mature, first-class OpenAPI emitter. The AsyncAPI side, for event-driven contracts like message queues and streaming topics, is still young. This project builds that emitter, so an HTTP API and an async API can live side by side in one TypeSpec workspace.

## Requirements

- Node.js >= 20
- [pnpm](https://pnpm.io/) (this repo's `devEngines` field pins ^11)

## Installation

This package is not yet published to npm. To try it locally:

```bash
git clone <this repo>
cd tsp-asyncapi
pnpm install
pnpm build
```

Then reference it from your TypeSpec project, either as a local `file:` dependency or via `pnpm link`.

## Usage

Add the library to your `main.tsp` and annotate your service with the provided decorators:

```typespec
import "tsp-asyncapi";

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
@server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
namespace Orders;

// The schema conversion layer turns this model into an AsyncAPI Schema
// Object (see the docs site); it lands in components.schemas once
// message payloads are wired up.
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

Configure the emitter in `tspconfig.yaml`:

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    output-file: "asyncapi.yaml"
    file-type: "yaml"
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

Then compile:

```bash
tsp compile . --emit tsp-asyncapi
```

This produces a fully compliant AsyncAPI 3.1.0 document.

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

## Roadmap

- [x] Document skeleton, `info`, tags, external docs.
- [x] TypeSpec-to-AsyncAPI-schema conversion (models, scalars, arrays, records, enums, unions, inheritance, validation).
- [ ] Channel, operation (send/receive), and message decorators.
- [ ] Mapping a TypeSpec model to an AsyncAPI message payload.
- [ ] Server and protocol bindings, starting with Kafka.
- [ ] Publish to npm.

## License

[MIT](./LICENSE)
