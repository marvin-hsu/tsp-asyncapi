---
title: "Avro Schemas"
description: "tsp-avro writes Apache Avro schema files from TypeSpec models, and it backs the avro feature of tsp-asyncapi. This page shows what it emits and the rules it holds."
---

# Avro Schemas

[`tsp-avro`](https://www.npmjs.com/package/tsp-avro) writes Apache Avro schema files from TypeSpec models, and it backs the `avro` feature of `tsp-asyncapi`.

::: warning
This package is experimental, and it is pre-1.0. Its decorators, its output and its diagnostics can change in any release. Pin an exact version if you depend on it.
:::

## Installing it and turning it on

Install the package next to the compiler.

```bash
pnpm add tsp-avro
```

Then name the emitter in `tspconfig.yaml`.

```yaml
emit:
  - "tsp-avro"

options:
  "tsp-avro":
    emitter-output-dir: "{project-root}/schemas"
```

## Example

The example below comes from [`examples/17-avro-schemas`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/17-avro-schemas).

```typespec
@Avro.avroNamespace("com.example.orders")
namespace Orders;

// The logical type sits on the scalar, so every field of this type carries
// it. A reader that knows `timestamp-millis` builds a timestamp. A reader
// that does not know it reads the `long`, which is what is on the wire.
/** A moment in time, as the milliseconds since the Unix epoch. */
@Avro.logicalType("timestamp-millis")
scalar Timestamp extends int64;
```

The namespace carries the Avro namespace. The nearest namespace above a declaration wins.

The logical type sits on the scalar. Every field of that scalar type carries it.

One model of the example is below. The repository holds the whole file.

```typespec
/** The fulfilment of an order moved on. */
@Avro.avroRecord
model OrderFulfilmentChanged {
  // `@aliases` names what a field used to be called. A reader written against
  // this schema still reads data written under the old name.
  /** The identifier of the order. */
  @Avro.aliases("orderNumber")
  @Avro.logicalType("uuid")
  id: string;

  /** When the fulfilment moved on. */
  changedAt: Timestamp;

  /** How far the order has got. */
  status: FulfilmentStatus;

  /** Where the order is going, as it stood at this moment. */
  shipping: Address;

  // The author wrote a default that is not null, so the string leads the
  // union and null follows it. That is the same Avro rule as above, read the
  // other way round.
  /** What the carrier calls this shipment. */
  trackingNumber?: string = "pending";
}
```

## The result

That model becomes `schemas/com/example/orders/OrderFulfilmentChanged.avsc`.

<!-- prettier-ignore -->
```json
{
  "type": "record",
  "name": "OrderFulfilmentChanged",
  "namespace": "com.example.orders",
  "doc": "The fulfilment of an order moved on.",
  "fields": [
    {
      "name": "id",
      "type": {
        "type": "string",
        "logicalType": "uuid"
      },
      "doc": "The identifier of the order.",
      "aliases": [
        "orderNumber"
      ]
    },
    {
      "name": "changedAt",
      "type": {
        "type": "long",
        "logicalType": "timestamp-millis"
      },
      "doc": "When the fulfilment moved on."
    },
    {
      "name": "status",
      "type": {
        "type": "enum",
        "name": "FulfilmentStatus",
        "namespace": "com.example.orders",
        "doc": "How far an order has got.",
        "symbols": [
          "Unknown",
          "Placed",
          "Packed",
          "Shipped",
          "Delivered"
        ],
        "default": "Unknown"
      },
      "doc": "How far the order has got."
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
            "name": "line2",
            "type": [
              "null",
              "string"
            ],
            "doc": "The flat, the floor, or whatever else the courier needs.",
            "default": null
          },
          {
            "name": "city",
            "type": "string"
          },
          {
            "name": "postcode",
            "type": "string",
            "doc": "The postcode, as the destination country writes it."
          },
          {
            "name": "country",
            "type": "string",
            "doc": "The ISO 3166-1 alpha-2 code of the country."
          }
        ]
      },
      "doc": "Where the order is going, as it stood at this moment."
    },
    {
      "name": "trackingNumber",
      "type": [
        "string",
        "null"
      ],
      "doc": "What the carrier calls this shipment.",
      "default": "pending"
    }
  ]
}
```

A `/** */` comment becomes the `doc` of what it sits on. A `//` comment is not emitted.

The file holds the model `Address` and the enum `FulfilmentStatus` in full. Neither declaration carries `@Avro.avroRecord`, so neither gets a file of its own.

## Optional fields and defaults

Avro reads a default against the first branch of a union alone. So the `?` and the `= value` of TypeSpec decide the shape together.

| TypeSpec           | Avro                                                   |
| ------------------ | ------------------------------------------------------ |
| `x: string`        | `{"name":"x","type":"string"}`                         |
| `x?: string`       | `{"name":"x","type":["null","string"],"default":null}` |
| `x: string = "a"`  | `{"name":"x","type":"string","default":"a"}`           |
| `x?: string = "a"` | `{"name":"x","type":["string","null"],"default":"a"}`  |

A union is written with `|`. A union inside a union is flattened, because Avro allows neither nesting nor a repeated branch. A named branch is compared by its full name. Every other branch is compared by its Avro type name.

## Arrays, maps and enums

`T[]` becomes an Avro array. `Record<T>` becomes an Avro map. Avro keys a map with strings, so only the value type is written.

<!-- prettier-ignore -->
```json
    {
      "name": "metadata",
      "type": {
        "type": "map",
        "values": "string"
      },
      "doc": "Whatever the checkout wanted to carry along."
    }
```

A TypeSpec enum becomes an Avro enum. Avro holds symbols alone, so a member that carries a value of its own is refused. `@Avro.enumDefault` names the symbol a reader falls back to.

## Scalars

| TypeSpec  | Avro      |
| --------- | --------- |
| `boolean` | `boolean` |
| `bytes`   | `bytes`   |
| `string`  | `string`  |
| `int32`   | `int`     |
| `int64`   | `long`    |
| `float32` | `float`   |
| `float64` | `double`  |

A scalar you declare is matched through the scalar it extends. `scalar Age extends int32` maps to `int`.

Avro has no unsigned integer. `uint32` and `uint64` are refused, because widening them would change what you wrote.

## Logical types

A logical type is an attribute of a type rather than a type of its own. Avro carries a date as an `int`, and a reader that knows the attribute builds a date from it. A reader that does not know it reads the number. So the attribute never changes what is on the wire.

`@Avro.logicalType` writes one. The specification names the type underneath each one, and this table is what the emitter holds.

| Logical type             | Written on      |
| ------------------------ | --------------- |
| `decimal`                | `bytes`, fixed  |
| `uuid`                   | `string`        |
| `date`                   | `int`           |
| `time-millis`            | `int`           |
| `time-micros`            | `long`          |
| `timestamp-millis`       | `long`          |
| `timestamp-micros`       | `long`          |
| `local-timestamp-millis` | `long`          |
| `local-timestamp-micros` | `long`          |
| `duration`               | fixed, 12 bytes |

A pair outside the table is refused. A name outside the table is refused as well.

`decimal` is the one logical type that takes parameters, so it has a decorator of its own. Write `@Avro.decimal(precision, scale)`. The precision counts the digits, and the scale says how many of them sit after the point. A decimal in a fixed type is bounded by the width of that type.

## Decorators

| Decorator                         | Target                           | What it does                                                         |
| --------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `@Avro.avroNamespace(name)`       | `Namespace`                      | Declares the Avro namespace. The nearest ancestor that has one wins. |
| `@Avro.avroRecord`                | `Model`                          | Marks a model to emit. One marked model becomes one file.            |
| `@Avro.aliases(...names)`         | `Model`, `ModelProperty`, `Enum` | Names what the declaration used to be called.                        |
| `@Avro.order(mode)`               | `ModelProperty`                  | `ascending`, `descending` or `ignore`.                               |
| `@Avro.fixed(size)`               | `Model`, `Scalar`                | Makes an Avro fixed type of that many bytes.                         |
| `@Avro.logicalType(name)`         | `Scalar`, `ModelProperty`        | Writes a logical type from the table above.                          |
| `@Avro.decimal(precision, scale)` | `Scalar`, `ModelProperty`        | Writes the `decimal` logical type with its parameters.               |
| `@Avro.enumDefault(member)`       | `Enum`                           | Names the symbol a reader falls back to.                             |

Documentation comes from the native `/** */` comment. A field default comes from the native `= value`. There is no decorator for either.

## Diagnostics

Every diagnostic of this package is an error. An error stops every write. So one compile writes the schemas you asked for, or it writes none.

A part of a schema is still a valid schema. A registry would accept one, and a reader would then decode data into a shape the author never wrote.

| Code                              | When                                                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `tsp-avro/namespace-required`     | A record has no Avro namespace above it.                              |
| `tsp-avro/invalid-name`           | A name breaks the Avro name rules.                                    |
| `tsp-avro/unsupported-type`       | A type has no Avro form.                                              |
| `tsp-avro/duplicate-union-branch` | Two branches of one union are the same Avro type.                     |
| `tsp-avro/invalid-default`        | A default has no JSON form, or it belongs to no branch of its union.  |
| `tsp-avro/invalid-order`          | `@Avro.order` was given something that is not an Avro field order.    |
| `tsp-avro/invalid-fixed`          | `@Avro.fixed` was given a width that is not positive.                 |
| `tsp-avro/invalid-decimal`        | A precision or a scale does not fit, or a `decimal` carries neither.  |
| `tsp-avro/unknown-logical-type`   | A logical type is not one the specification defines.                  |
| `tsp-avro/logical-type-mismatch`  | A logical type is written on a type the specification does not allow. |
| `tsp-avro/duplicate-logical-type` | One declaration carries two logical types.                            |
| `tsp-avro/enum-default`           | `@Avro.enumDefault` names a member the enum does not declare.         |
| `tsp-avro/duplicate-record`       | Two records write to one path.                                        |
| `tsp-avro/enum-member-value`      | An enum member carries a value of its own.                            |

## Refusals

- A model that extends another model. An Avro record holds no inheritance.
- An anonymous model. An Avro record needs a name.
- A template instance, such as `Box<string>`. Two instances of one template share a name.
- A model that holds an index signature and fields together.
- A scalar outside the table above.
- A union that names one type twice, such as `string[] | int32[]`.
- Two declarations that resolve to one Avro full name.
