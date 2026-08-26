---
title: "Avro Payloads"
description: "A model that carries the tsp-avro decorators can get an Avro schema as its AsyncAPI payload. This page shows how to turn that on and what it writes."
---

# Avro Payloads

A model that carries the `tsp-avro` decorators can get an Avro schema as its AsyncAPI payload. This page shows how to turn that on and what it writes.

::: warning
This is a preview feature. It is off by default. The option that turns it on, the schema it writes, and the diagnostics it reports can change in a minor release.

`tsp-avro` is experimental as well. It is pre-1.0, and its decorators and its output can change in any release.
:::

## What it does

[`tsp-avro`](./avro-schemas) describes a model as an Avro record. Its own emitter writes that record out as a `.avsc` file.

This emitter calls the same walk. The schema that walk returns becomes the payload of the AsyncAPI message. So one source describes the data once, and the document and the `.avsc` files carry one schema.

Without the feature the `tsp-avro` decorators change nothing here. The models lower to JSON Schema, the way every other model does.

## Turning it on

Install the Avro library next to this emitter.

```bash
pnpm add "tsp-avro@0.2.x"
```

This release supports the `0.2.x` range of that library. `tsp-avro` is an optional peer dependency of this emitter. A project that never turns the feature on never installs it, and never loads it.

Then name the feature in `tspconfig.yaml`.

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["avro"]
```

The reserved names of [`preview-features`](../reference/emitter-options#preview-features) are `protobuf` and `avro`. Both work in this release.

## Writing the source

The example below is [`examples/18-avro-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/18-avro-payloads) in the repository. One Avro namespace, two records, and a Kafka cluster with a schema registry. The excerpts below are parts of that file. The repository holds the whole of it.

`@Avro.avroNamespace` marks the namespace that qualifies every Avro name under it.

```typespec
@Avro.avroNamespace("com.example.orders")
namespace Orders {
```

`@Avro.avroRecord` marks a model that becomes one Avro record. `@message` marks the same model as a message of the document. The two decorators answer different questions, so a message with an Avro payload carries both.

```typespec
  /**
   * One order a customer placed.
   */
  @message
  @contentType("application/vnd.apache.avro")
  @headers(EventHeaders)
  @Avro.avroRecord
  @kafkaMessage(#{ schemaIdLocation: "payload", schemaLookupStrategy: "TopicIdStrategy" })
  // An example carries the headers as well as the payload. The two halves are
  // written in different schema languages, so an example shows a reader what
  // each of them looks like on its own terms. A logical type is written as
  // what is on the wire: a `uuid` is the text of the UUID, and a
  // `timestamp-millis` is the millisecond count.
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "checkout" },
      payload: #{
        id: "6b1f7c2e-6f3a-4f52-9c1c-0f0b6a1d3f10",
        placedAt: 1755993600000,
        shipping: #{ line1: "12 Zhongxiao E Rd", city: "Taipei", country: "TW" },
        totalMinorUnits: 249000,
      },
    },
    #{ name: "typical-order", summary: "One order, paid in TWD." }
  )
  model OrderPlaced {
    // `uuid` is written on a string, so what is on the wire is the text of
    // the UUID.
    /** The identifier of the order. */
    @Avro.logicalType("uuid")
    id: string;

    /** When the customer placed the order. */
    placedAt: Timestamp;

    /** Where the order goes. */
    shipping: Address;

    /** What the order came to, in the smallest unit of its currency. */
    totalMinorUnits: int64;
  }
```

Avro says nothing about the topics a record travels on. So the channels are written the same way as for any other payload.

```typespec
@kafkaChannel(#{ topic: "orders.placed", partitions: 12, replicas: 3 })
@channel("orders.placed")
interface Placed {
  @send
  op placed(event: Orders.OrderPlaced): void;
}

// The retry topic carries the same message as the main one. One model is one
// message of the document, so both channels point at one entry under
// `components.messages` rather than at two copies of it.
@kafkaChannel(#{ topic: "orders.placed.retry", partitions: 3, replicas: 3 })
@channel("orders.placed.retry")
interface PlacedRetry {
  @send
  op retried(event: Orders.OrderPlaced): void;
}
```

Two channels carry `OrderPlaced`. One model is one message of the document, so both channels point at one entry under `components.messages`.

## What the emitter writes

The payload is a [Multi Format Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#multiFormatSchemaObject). `schemaFormat` names Avro 1.9.0, and `schema` holds the schema.

The schema is an object, not a string. Avro is JSON, and AsyncAPI inlines a schema of a JSON based format rather than carrying it as text. This is the `OrderPlaced` message of the example, as `asyncapi.yaml` carries it:

```yaml
components:
  schemas:
    Orders.EventHeaders:
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
      contentType: application/vnd.apache.avro
      headers:
        $ref: "#/components/schemas/Orders.EventHeaders"
      payload:
        schemaFormat: application/vnd.apache.avro;version=1.9.0
        schema:
          type: record
          name: OrderPlaced
          namespace: com.example.orders
          doc: One order a customer placed.
          fields:
            - name: id
              type:
                type: string
                logicalType: uuid
              doc: The identifier of the order.
            - name: placedAt
              type:
                type: long
                logicalType: timestamp-millis
              doc: When the customer placed the order.
            - name: shipping
              type:
                type: record
                name: Address
                namespace: com.example.orders
                doc: Where an order goes.
                fields:
                  - name: line1
                    type: string
                    doc: The street and the number.
                  - name: city
                    type: string
                  - name: country
                    type: string
                    doc: The ISO 3166-1 alpha-2 code of the country.
              doc: Where the order goes.
            - name: totalMinorUnits
              type: long
              doc: What the order came to, in the smallest unit of its currency.
      bindings:
        $ref: "#/components/messageBindings/OrderPlaced"
```

Each payload carries one Avro record and every named type that record reaches. Avro has no import, so a schema stands alone or a reader cannot build it.

`Address` is reached by both records, so both payloads hold a whole copy of it. `Address` is not a message of the document, so it gets no payload of its own. A named type is written in full at its first occurrence and by name after that. That is also how a record that reaches itself terminates.

## How it works

The compiler runs the `tsp-avro` decorators and each one records what it was given. `@Avro.avroNamespace` records the Avro namespace of a TypeSpec namespace. `@Avro.avroRecord` records that a model is an Avro record. The other decorators record what Avro has and TypeSpec cannot say, such as a logical type or an alias.

This emitter reads none of those records. It loads `tsp-avro` and calls the walk that library already has. The Avro emitter and this one therefore render one schema from one walk, and neither can drift from the other.

The load happens at run time, and only when the feature is on. `tsp-avro` is experimental and this package is not, so a static import would tie a stable release to a pre-1.0 version range. A project that leaves the feature off never loads the library.

The walk collects its refusals here rather than reporting them. A project that emits both the `.avsc` files and the document would otherwise read every refusal twice, once from each emitter. So this emitter carries the reason into a diagnostic of its own, and one compile speaks with one voice.

## Emitting the `.avsc` files as well

The two emitters are independent. List both in `emit` when the project also needs the files on disk.

```yaml
emit:
  - "tsp-asyncapi"
  - "tsp-avro"

options:
  "tsp-asyncapi":
    preview-features: ["avro"]
  "tsp-avro":
    emitter-output-dir: "{project-root}/schemas"
```

The Avro emitter writes one file per record. The Avro namespace decides the path, so the example writes `schemas/com/example/orders/OrderPlaced.avsc` and `schemas/com/example/orders/OrderCancelled.avsc`. The first one:

```json
{
  "type": "record",
  "name": "OrderPlaced",
  "namespace": "com.example.orders",
  "doc": "One order a customer placed.",
  "fields": [
    {
      "name": "id",
      "type": {
        "type": "string",
        "logicalType": "uuid"
      },
      "doc": "The identifier of the order."
    },
    {
      "name": "placedAt",
      "type": {
        "type": "long",
        "logicalType": "timestamp-millis"
      },
      "doc": "When the customer placed the order."
    },
    {
      "name": "shipping",
      "type": {
        "type": "record",
        "name": "Address",
        "namespace": "com.example.orders",
        "doc": "Where an order goes.",
        "fields": [
          {
            "name": "line1",
            "type": "string",
            "doc": "The street and the number."
          },
          {
            "name": "city",
            "type": "string"
          },
          {
            "name": "country",
            "type": "string",
            "doc": "The ISO 3166-1 alpha-2 code of the country."
          }
        ]
      },
      "doc": "Where the order goes."
    },
    {
      "name": "totalMinorUnits",
      "type": "long",
      "doc": "What the order came to, in the smallest unit of its currency."
    }
  ]
}
```

The file and the payload carry one schema. The file is that schema as JSON text. The payload is the same schema as an object. So the payload is the same whether the files are written or not.

## Headers stay out of the payload

`@header` lifts a property out of the payload and describes it beside the message. A generated Avro payload leaves it out for the same reason a JSON Schema payload does.

Avro has no way to describe a property the payload does not carry. Every property of a record is a field of that record, and there is no mark for one that travels elsewhere.

So a model that carries `@Avro.avroRecord` must not mark one of its own fields with `@header`. A model that does reports [`header-on-generated-payload`](../reference/diagnostics#header-on-generated-payload), and no file is written.

Use [`@headers`](../reference/decorators/messages#headers) instead. A separate model holds the headers, the message model holds the payload, and the record and the `.avsc` file describe the same fields.

The headers are lowered from their TypeSpec model, so they are JSON Schema while the payload is Avro. A Multi Format Schema Object takes a different format in each slot, which is what makes that legal.

Headers are never Avro, and this is not a limitation of the preview feature. A header travels as its own key and value, so no transport carries the headers object as one encoded block. Avro could not name most of them either: a legal Avro name matches `[A-Za-z_][A-Za-z0-9_]*`, and a header is usually written `x-correlation-id`.

## What Avro does not describe

Avro describes the data. It says nothing about the channel a message travels on, the direction of a message, or the operations of an application.

So `@channel`, `@send`, `@receive` and `@message` are still required. A model that carries `@Avro.avroRecord` and no `@AsyncAPI.message` gets no payload and reports nothing.

## A payload the author wrote by hand

[`@rawPayload`](../reference/decorators/messages#rawpayload) writes a schema in another language by hand. It is an explicit statement, so it wins over a generated one.

A model that carries both reports [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source). The document keeps the authored schema. Remove `@rawPayload` from the model to take the generated one.

## When no schema is available

The Avro walk refuses a construct Avro cannot carry. Inheritance, an anonymous model, a template instance, an unsigned integer, and a union that names one type twice are each refused. The [Avro Schemas guide](./avro-schemas) lists every refusal.

A refusal on a model the document names reports [`avro-artifact-unavailable`](../reference/diagnostics#avro-artifact-unavailable). The message quotes the reason the walk gave.

Only the first reason is quoted. The walk keeps going after a refusal, so one model can collect several. This emitter reports one diagnostic per model, and that diagnostic carries the first reason alone. So a model with several problems shows one of them here. To read all of them, put `tsp-avro` in `emit` and compile again. Its own emitter reports every reason.

The emitter reports the problem instead of falling back to the schema the TypeSpec model produces. No document is written either, because a document that fell back to JSON Schema would answer a request for Avro without saying so.

## When the library is missing

The feature loads `tsp-avro` on the first compile that needs it. A load that fails reports [`avro-library-missing`](../reference/diagnostics#avro-library-missing), and the message quotes what the load reported.

The author writes `@Avro.avroRecord`, so the library is installed whenever a model carries it. A load that fails is a broken install. Install `tsp-avro` beside this emitter, or remove `avro` from `preview-features`.
