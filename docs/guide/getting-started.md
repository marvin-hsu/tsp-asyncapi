# Getting Started

`tsp-asyncapi` is an [AsyncAPI 3.1](https://www.asyncapi.com/) emitter for [TypeSpec](https://typespec.io/). You describe an event-driven API in TypeSpec. The emitter produces an AsyncAPI document from that one source of truth.

## What the emitter produces today

This project is a work in progress. Knowing exactly what you get — and what you don't get yet — is the first thing to understand.

| Part of the AsyncAPI document                                                    | Status                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Document skeleton (`asyncapi`, `id`, `defaultContentType`)                       | ✅ Emitted                                                                                                                                  |
| `info` block: title, version, description, contact, license, tags, external docs | ✅ Emitted                                                                                                                                  |
| `channels`, `operations`, `messages`                                             | ✅ Emitted — see [Request and Reply](./request-reply)                                                                                       |
| `components.schemas` (model → schema conversion)                                 | 🚧 Conversion layer is implemented and fully unit-tested, but not yet wired into the emitted file. It lands together with message payloads. |
| Servers, security, protocol bindings (Kafka first)                               | 🚧 Planned                                                                                                                                  |

In short: today you can model your event contracts in TypeSpec, get a valid AsyncAPI 3.1.0 document with complete `info` metadata, and rely on the [schema conversion rules](./schema-conversion) when designing your models — those rules are stable and tested, and your models will flow into the document unchanged once message support lands.

## Requirements

- Node.js >= 20
- [pnpm](https://pnpm.io/) (this repo's `devEngines` field pins ^11)

## Installation

This package is not yet published to npm. To try it locally:

```bash
git clone https://github.com/marvin-hsu/tsp-asyncapi.git
cd tsp-asyncapi
pnpm install
pnpm build
```

Then reference it from your own TypeSpec project as a local dependency:

```json
// package.json of your TypeSpec project
{
  "dependencies": {
    "tsp-asyncapi": "file:../tsp-asyncapi"
  }
}
```

(or use `pnpm link` if you prefer.)

## Your first AsyncAPI document

Create a `main.tsp`:

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
namespace Orders;
```

Configure the emitter in `tspconfig.yaml`:

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

Compile:

```bash
tsp compile .
```

The output lands in `tsp-output/tsp-asyncapi/asyncapi.yaml`. This is the **actual, complete output** of the example above:

```yaml
asyncapi: 3.1.0
id: urn:com:example:orders
info:
  title: Order Service API
  version: 1.0.0
  description: This is a sample Order Service event-driven API.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
  tags:
    - name: payment
    - name: orders
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
defaultContentType: application/json
channels: {}
operations: {}
components: {}
```

## How each line got there

| Output field                                                          | Source                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                                                                  | `asyncapi-id` emitter option                                                                      |
| `info.title`                                                          | `@service(#{ title: ... })`                                                                       |
| `info.version`, `description`, `contact`, `license`, `termsOfService` | `@info(#{ ... })`                                                                                 |
| `info.description` (fallback)                                         | `@doc` or a `/** ... */` doc comment on the namespace, used only when `@info` sets no description |
| `info.tags`                                                           | one entry per `@tag`                                                                              |
| `info.externalDocs`                                                   | `@externalDocs(url, description?)`                                                                |
| `defaultContentType`                                                  | `default-content-type` emitter option                                                             |

Without `@service`, the document still emits, with the fallback `info: { title: "AsyncAPI Document", version: "0.0.0" }`. With more than one `@service` in the program, the emitter warns (`multiple-services`) and uses the first one.

## Next steps

- Design your event payload models with the [Schema Conversion](./schema-conversion) rules — verified input/output pairs for every supported construct.
- See all configuration knobs in [Emitter Options](../reference/emitter-options).
- Browse the [Decorators](../reference/decorators) reference for exact signatures.
- When the emitter warns or errors, look it up in [Diagnostics](../reference/diagnostics).
