---
title: "Protobuf Payloads"
description: "A model that carries the official TypeSpec.Protobuf decorators can get proto3 text as its AsyncAPI payload. This page shows how to turn that on and what it writes."
---

# Protobuf Payloads

`tsp-asyncapi` supports the decorators of [`@typespec/protobuf`](https://www.npmjs.com/package/@typespec/protobuf) natively.

::: warning
This is a preview feature. It is off by default. The option that turns it on, the schema it writes, and the diagnostics it reports can change in a minor release.
:::

## How to use it

Install the official library next to this emitter.

```bash
pnpm add "@typespec/protobuf@0.85.x"
```

The supported version is `0.85.x`. `@typespec/protobuf` is not yet at 1.0, so its decorators can still change. The supported range follows the official releases.

Then turn on the `protobuf` preview feature in `tspconfig.yaml`.

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["protobuf"]
```

## Example

The example below comes from [`examples/16-protobuf-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/16-protobuf-payloads). Two Protobuf packages, three messages with examples, and a RabbitMQ broker with AMQP bindings. The excerpt below is the orders package and one channel.

```typespec
/** What every message of this application carries beside its payload. */
model EventHeaders {
  /** Ties every message of one request together. */
  `x-correlation-id`: string;

  /** The application that published the message. */
  `x-source`: string;
}
```

```typespec
@Protobuf.package({ name: "com.example.orders" })
namespace Orders {
  /**
   * An amount of money, as the smallest unit of one currency.
   */
  // No `@AsyncAPI.message` here: this model is not a message of the
  // document. It still reaches the emitted payloads, because `OrderPlaced`
  // names it in a field, and a payload carries every declaration its
  // message reaches.
  @Protobuf.message
  model Money {
    @Protobuf.field(1)
    currency: string;

    @Protobuf.field(2)
    amount: int64;
  }

  /**
   * One order a customer placed.
   */
  // Two decorators named `message` are in scope. The AsyncAPI one marks a
  // model as a message of the document. The Protobuf one marks it as a
  // message of the `.proto` file. The Protobuf one is written qualified.
  @message
  @headers(EventHeaders)
  @Protobuf.message
  // An example carries the headers as well as the payload. The headers are
  // JSON Schema and the payload is proto3, so an example shows a reader what
  // each half looks like on its own terms.
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "checkout" },
      payload: #{ orderId: "ord-1001", total: #{ currency: "TWD", amount: 249000 } },
    },
    #{ name: "typical-order", summary: "One order, paid in TWD." }
  )
  model OrderPlaced {
    @Protobuf.field(1)
    orderId: string;

    @Protobuf.field(2)
    total: Money;
  }
}

// The channel is a topic exchange, said with an AMQP channel binding.
@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "orders", type: "topic", durable: true, vhost: "/orders" },
})
@channel("order.placed")
interface Placed {
  // Persistent delivery, said with an AMQP operation binding. `deliveryMode`
  // is 1 for transient and 2 for persistent.
  @amqpOperation(#{ deliveryMode: 2, mandatory: true, timestamp: true })
  @send
  op placed(event: Orders.OrderPlaced): void;
}
```

## The result

The payload is a [Multi Format Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#multiFormatSchemaObject). `schemaFormat` names proto3, and `schema` holds the text. This is the `OrderPlaced` message of the example, as `asyncapi.yaml` carries it:

```yaml
components:
  schemas:
    EventHeaders:
      type: object
      properties:
        x-correlation-id:
          type: string
          description: Ties every message of one request together.
        x-source:
          type: string
          description: The application that published the message.
      required:
        - x-correlation-id
        - x-source
      description: What every message of this application carries beside its payload.
  messages:
    OrderPlaced:
      name: OrderPlaced
      description: One order a customer placed.
      headers:
        $ref: "#/components/schemas/EventHeaders"
      payload:
        schemaFormat: application/vnd.google.protobuf;version=3
        schema: |
          syntax = "proto3";

          package com.example.orders;

          // One order a customer placed.
          message OrderPlaced {
            string orderId = 1;
            Money total = 2;
          }

          // An amount of money, as the smallest unit of one currency.
          message Money {
            string currency = 1;
            int64 amount = 2;
          }
      examples:
        - name: typical-order
          summary: One order, paid in TWD.
          headers:
            x-correlation-id: req-8f21
            x-source: checkout
          payload:
            orderId: ord-1001
            total:
              currency: TWD
              amount: 249000
```

Each payload is proto3 text that stands on its own. It carries the `syntax` line, the `package` line, its own message, and every declaration that message reaches through its fields. A declaration the message never reaches is left out. So a payload describes one message and nothing else.

`OrderPlaced` names `Money` in a field, so its payload carries both declarations. `OrderShipped` names nothing, so its payload carries itself alone. `Money` is not a message of the document, so it gets no payload of its own.

## The `.proto` file

To get the `.proto` file as well, add the official emitter to `emit` in `tspconfig.yaml`.

```yaml
emit:
  - "tsp-asyncapi"
  - "@typespec/protobuf"

options:
  "tsp-asyncapi":
    preview-features: ["protobuf"]
  "@typespec/protobuf":
    emitter-output-dir: "{project-root}/proto"
```

The official emitter writes one file per package: `proto/com/example/orders.proto` and `proto/com/example/billing.proto`. The orders one:

```proto
// Generated by Microsoft TypeSpec

syntax = "proto3";

package com.example.orders;

// An amount of money, as the smallest unit of one currency.
message Money {
  string currency = 1;
  int64 amount = 2;
}

// One order a customer placed.
message OrderPlaced {
  string orderId = 1;
  Money total = 2;
}

// One order that left the warehouse.
message OrderShipped {
  string orderId = 1;
  string carrier = 2;
}
```

## Headers

A model that carries `@Protobuf.message` must not mark one of its own properties with `@header`. A model that does reports [`header-on-generated-payload`](../reference/diagnostics#header-on-generated-payload), and no file is written.

To describe headers, point [`@headers`](../reference/decorators/messages#headers) at a separate model.

## `@rawPayload`

[`@rawPayload`](../reference/decorators/messages#rawpayload) writes a schema in another language by hand. It wins over a generated one.

A model that carries both reports [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source). The document keeps the authored schema. Remove `@rawPayload` from the model to take the generated one.

## When no text is available

A generated payload can be missing, for one of three reasons. The model can have no `@Protobuf.package` above it. The walk can reach a construct that has no proto3 form this emitter writes. A field can use a scalar that maps to no proto3 type.

Each of these reports [`protobuf-artifact-unavailable`](../reference/diagnostics#protobuf-artifact-unavailable), and the message says which one it is. The reference page lists every construct the walk refuses.
