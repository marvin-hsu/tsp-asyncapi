---
title: "Protobuf Payloads"
description: "A model that carries the official TypeSpec.Protobuf decorators can get proto3 text as its AsyncAPI payload. This page shows how to turn that on and what it writes."
---

# Protobuf Payloads

A model that carries the official `TypeSpec.Protobuf` decorators can get proto3 text as its AsyncAPI payload. This page shows how to turn that on and what it writes.

::: warning
This is a preview feature. It is off by default. The option that turns it on, the schema it writes, and the diagnostics it reports can change in a minor release.
:::

## What it does

The [`@typespec/protobuf`](https://www.npmjs.com/package/@typespec/protobuf) library describes a model as a Protobuf message. Its own emitter writes that model out as a `.proto` file.

This emitter reads the same decorators. It writes proto3 text of its own, and that text becomes the payload of the AsyncAPI message. So one source describes the data once, and the document and the `.proto` file describe one wire format.

Without the feature the official decorators change nothing here. The models lower to JSON Schema, the way every other model does.

## Turning it on

Install the official library next to this emitter.

```bash
npm install @typespec/protobuf
```

Then name the feature in `tspconfig.yaml`.

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["protobuf"]
```

The reserved names of [`preview-features`](../reference/emitter-options#preview-features) are `protobuf` and `avro`. Only `protobuf` works in this release. A request for `avro` reports [`preview-feature-unavailable`](../reference/diagnostics#preview-feature-unavailable), and nothing is written.

## Writing the source

The example below is [`examples/16-protobuf-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/16-protobuf-payloads) in the repository. Two Protobuf packages, three messages with examples, and a RabbitMQ broker with AMQP bindings. The excerpt below is the orders package and one channel; the repository holds the whole file.

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
  @Protobuf.message
  @messageExample(
    #{ payload: #{ orderId: "ord-1001", total: #{ currency: "TWD", amount: 249000 } } },
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

Two decorators named `message` are in scope. `@message` is the AsyncAPI one, and it marks a model as a message of the document. `@Protobuf.message` marks the same model as a message of the `.proto` file. Write the Protobuf one qualified.

`@Protobuf.package` marks the namespace that becomes one `.proto` file. The name in it is the `package` declaration of that file, and it is independent of the TypeSpec namespace name.

## What the emitter writes

The payload is a [Multi Format Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#multiFormatSchemaObject). `schemaFormat` names proto3, and `schema` holds the text. This is the `OrderPlaced` message of the example, as `asyncapi.yaml` carries it:

```yaml
components:
  messages:
    OrderPlaced:
      name: OrderPlaced
      description: One order a customer placed.
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
          payload:
            orderId: ord-1001
            total:
              currency: TWD
              amount: 249000
```

Each payload is proto3 text that stands on its own. It carries the `syntax` line, the `package` line, its own message, and every declaration that message reaches through its fields. A declaration the message never reaches is left out. So a payload describes one message and nothing else.

`OrderPlaced` names `Money` in a field, so its payload carries both declarations. `OrderShipped` names nothing, so its payload carries itself alone. `Money` is not a message of the document, so it gets no payload of its own.

The message of a payload is the one declaration nothing else in the text references. That is how a Protobuf reader finds the root. Every other declaration is there because a reference pulled it in, so there is always exactly one such declaration.

Two models of one package are therefore two payloads. The wire formats differ. One shared schema would claim that one type decodes both.

## How it works

The compiler runs the official decorators and each one records what it was given. `@Protobuf.package` records the name of a package on a namespace. `@Protobuf.message` records that a model is a Protobuf message. `@Protobuf.field` records the number of a property. `@Protobuf.reserve` records what a message reserves.

This emitter reads those records. For one message model it finds the nearest namespace above it that carries `@Protobuf.package`. Then it walks the fields of the model. A scalar field becomes a proto3 scalar. A field whose type is a named model or enum pulls that declaration in, and the walk continues into it. A declaration already in the text is not walked again, so a model that reaches itself stops.

The result is the closure of one message. A printer writes it out as proto3 text, in the order the walk reached each declaration. The order of the fields is the order the model declares its properties. So one source renders one text, every time.

Nothing in this emitter imports `@typespec/protobuf` at run time. The compiler builds a state key from the library name, so the records are reachable by name alone. The official library stays a dependency of the project that writes the decorators.

The official emitter is the authority on what those decorators mean. The test suite compiles one source twice. One compile renders the payload with this emitter. The other runs the official emitter and reads the `.proto` file it wrote. Both texts are parsed into descriptors, and the descriptors are compared. Types, field numbers, labels, and names must be equal. Comments and layout are not compared, because two texts that describe one wire format are equal for every consumer of the document.

## Emitting the `.proto` file as well

The two emitters are independent. List both in `emit` when the project also needs the file on disk.

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

This emitter never reads that file, and it never runs the official emitter. The two read the same decorators and write their own text. So the payload is the same whether the file is written or not.

The two texts differ in layout. The file above holds every message of the package, in the order the source declares them. A payload holds one message and its closure, and the message comes first. Both describe the same wire format.

## What Protobuf does not describe

Protobuf describes the data. It says nothing about the channel a message travels on, the direction of a message, or the operations of an application.

So `@channel`, `@send`, `@receive` and `@message` are still required. A model that carries `@Protobuf.message` and no `@AsyncAPI.message` gets no payload and reports nothing.

## A payload the author wrote by hand

[`@rawPayload`](../reference/decorators/messages#rawpayload) writes a schema in another language by hand. It is an explicit statement, so it wins over a generated one.

A model that carries both reports [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source). The document keeps the authored schema. Remove `@rawPayload` from the model to take the generated one.

## When no text is available

A generated payload can be missing, for one of three reasons. The model can have no `@Protobuf.package` above it. The walk can reach a construct that has no proto3 form this emitter writes. A field can use a scalar that maps to no proto3 type.

Each of these reports [`protobuf-artifact-unavailable`](../reference/diagnostics#protobuf-artifact-unavailable), and the message says which one it is. The reference page lists every construct the walk refuses.

The emitter reports the problem instead of writing an empty payload. An empty payload reads as a schema that describes nothing. No document is written either, because a document that fell back to JSON Schema would answer a request for proto3 without saying so.
