---
title: "Getting Started"
description: "Install tsp-asyncapi and compile a first AsyncAPI 3.1 document from TypeSpec."
---

# Getting Started

`tsp-asyncapi` is an [AsyncAPI 3.1](https://www.asyncapi.com/) emitter for [TypeSpec](https://typespec.io/). Install it, compile a small service, and the emitter writes the document.

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
  description: "A sample event-driven order API.",
})
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

Compile:

```bash
tsp compile .
```

That writes `tsp-output/tsp-asyncapi/asyncapi.yaml`:

```yaml
asyncapi: 3.1.0
info:
  title: Order Service API
  version: 1.0.0
  description: A sample event-driven order API.
channels:
  orders.created:
    address: orders.created
    description: Every order a customer places lands here.
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
```

## How the `info` fields got there

| Output field                                                          | Source                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `info.title`                                                          | `@service(#{ title: ... })`                                                                       |
| `info.version`, `description`, `contact`, `license`, `termsOfService` | `@info(#{ ... })`                                                                                 |
| `info.description` (fallback)                                         | `@doc` or a `/** ... */` doc comment on the namespace, used only when `@info` sets no description |
| `info.tags`                                                           | one entry per `@tag`                                                                              |
| `info.externalDocs`                                                   | `@externalDocs(url, description?)`                                                                |
| `id`                                                                  | The `asyncapi-id` option in `tspconfig.yaml`                                                      |
| `defaultContentType`                                                  | The `default-content-type` option in `tspconfig.yaml`                                             |

With more than one `@service`, the first is used and `multiple-services`
is reported. To get a document per service, split them into separate projects that
share the same TypeSpec sources.

The [Document Info](../reference/decorators/document-info) page lists every decorator on this block.

## Next steps

- Design payload models with the [Schema Conversion](./schema-conversion/) rules.
- See [Examples](./examples) for a complete project per protocol.
