---
title: "Avro Payloads"
description: "A model that carries the tsp-avro decorators can get an Avro schema as its AsyncAPI payload. This page shows how to turn that on and what it writes."
---

# Avro Payloads

This feature works through [`tsp-avro`](./avro-schemas).

::: warning
This is a preview feature. It is off by default. The option that turns it on, the schema it writes, and the diagnostics it reports can change in a minor release.

`tsp-avro` is experimental as well. It is pre-1.0, and its decorators and its output can change in any release.
:::

## How to use it

Install the Avro library next to this emitter.

```bash
pnpm add "tsp-avro@0.2.x"
```

The supported version is `0.2.x`. `tsp-avro` is not yet at 1.0, so its decorators can still change. The supported range follows its releases.

Then turn on the `avro` preview feature in `tspconfig.yaml`.

```yaml
emit:
  - "tsp-asyncapi"

options:
  "tsp-asyncapi":
    preview-features: ["avro"]
```

## Example

The example below comes from [`examples/18-avro-payloads`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/18-avro-payloads). One Avro namespace, two records, and a Kafka cluster with a schema registry. The excerpts below are parts of that file.

`@Avro.avroNamespace` marks the namespace that qualifies every Avro name under it.

```typespec
@Avro.avroNamespace("com.example.orders")
namespace Orders {
```

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

## The result

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

## The `.avsc` files

To get the `.avsc` files as well, add the Avro emitter to `emit` in `tspconfig.yaml`.

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

## Headers

A model that carries `@Avro.avroRecord` must not mark one of its own properties with `@header`. A model that does reports [`header-on-generated-payload`](../reference/diagnostics#header-on-generated-payload), and no file is written.

To describe headers, point [`@headers`](../reference/decorators/messages#headers) at a separate model.

## `@rawPayload`

[`@rawPayload`](../reference/decorators/messages#rawpayload) writes a schema in another language by hand. It wins over a generated one.

A model that carries both reports [`conflicting-message-schema-source`](../reference/diagnostics#conflicting-message-schema-source). The document keeps the authored schema. Remove `@rawPayload` from the model to take the generated one.
