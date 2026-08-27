---
title: "Getting Started"
description: "tsp-asyncapi is an AsyncAPI 3.1 emitter for TypeSpec. This page installs it, writes a first document, and accounts for every field in the output."
---

# Getting Started

`tsp-asyncapi` is an [AsyncAPI 3.1](https://www.asyncapi.com/) emitter for [TypeSpec](https://typespec.io/). This page installs it, writes a first document, and accounts for every field in the output.

## Requirements

Node.js 20 or later. The examples use pnpm; npm and yarn work too.

## Installation

Install it in your TypeSpec project:

```bash
pnpm add tsp-asyncapi
```

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

That writes `tsp-output/tsp-asyncapi/asyncapi.yaml`:

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
    - $ref: "#/components/tags/payment"
    - $ref: "#/components/tags/orders"
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
defaultContentType: application/json
channels: {}
operations: {}
components:
  tags:
    payment:
      name: payment
    orders:
      name: orders
```

## How each line got there

| Output field                                                          | Source                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `id`                                                                  | The `asyncapi-id` option in `tspconfig.yaml`                                                      |
| `info.title`                                                          | `@service(#{ title: ... })`                                                                       |
| `info.version`, `description`, `contact`, `license`, `termsOfService` | `@info(#{ ... })`                                                                                 |
| `info.description` (fallback)                                         | `@doc` or a `/** ... */` doc comment on the namespace, used only when `@info` sets no description |
| `info.tags`                                                           | one entry per `@tag`                                                                              |
| `info.externalDocs`                                                   | `@externalDocs(url, description?)`                                                                |
| `defaultContentType`                                                  | The `default-content-type` option in `tspconfig.yaml`                                             |

With more than one `@service`, the first is used and `multiple-services`
is reported. To get a document per service, split them into separate projects that
share the same TypeSpec sources.

## Next steps

- Design your event payload models with the [Schema Conversion](./schema-conversion/) rules — verified input/output pairs for every supported construct.
- See all configuration knobs in [Emitter Options](../reference/emitter-options).
- Browse the [Decorators](../reference/decorators/) reference for exact signatures.
- When the emitter reports a warning or an error, look it up in [Diagnostics](../reference/diagnostics).
