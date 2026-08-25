# tsp-avro

**Experimental.** This package emits [Apache Avro][avro] schema files from
TypeSpec. It is version 0.1.0, and its public surface may change in any
release. Pin an exact version if you depend on it.

It is the Avro counterpart of [`@typespec/protobuf`][protobuf]. It is not an
AsyncAPI package: it declares its own decorators, registers its own `$onEmit`,
and writes `.avsc` files.

## Status

The walk is partial. It writes records, fields, arrays, maps and enums. It
refuses everything else, and a refusal is an error.

These are not supported yet. Each one is refused with a diagnostic.

- An optional property, and a property with a default value.
- A union.
- A model that extends another model.
- An anonymous model.
- A template instance, such as `Box<string>`.
- A model that holds an index signature and fields together.
- A scalar outside the table below.

## Install

```bash
npm install tsp-avro
```

## Use

```yaml
# tspconfig.yaml
emit:
  - "tsp-avro"
```

The emitter takes no option of its own. Set the output directory with the
compiler option `emitter-output-dir`.

```typespec
import "tsp-avro";

@Avro.`namespace`("com.example.orders")
namespace Orders {
  /** Where an order goes. */
  model Address {
    street: string;
    city: string;
  }

  /** An order left the checkout. */
  @Avro.`record`
  model OrderPlaced {
    id: string;
    shipping: Address;
    tags: string[];
  }
}
```

That source writes one file, `com/example/orders/OrderPlaced.avsc`.

## Write both decorator names in backticks

TypeSpec reserves the words `namespace` and `record`. Write
`` @Avro.`namespace` `` and `` @Avro.`record` `` with backticks around the
name. Without them the compiler reports `reserved-identifier`.

The upstream Protobuf library writes `` @Protobuf.`package` `` the same way,
for the same reason.

## Decorators

| Decorator                   | Target      | What it does                                                                                 |
| --------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| ``@Avro.`namespace`(name)`` | `Namespace` | Declares the Avro namespace of everything inside. The nearest ancestor that carries it wins. |
| `` @Avro.`record` ``        | `Model`     | Marks a model to emit. One marked model becomes one `.avsc` file.                            |

## One file holds one whole schema

Avro has no import. A schema file stands alone.

So every named type a record reaches is written into that record's own file.
Avro writes a named type in full the first time it appears. It writes the full
name alone after that. Two records that share a third one each hold a copy of
it.

A record that reaches itself needs no rule of its own. Its name is written
before its fields, so the field that reaches back finds the name already
there.

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

A scalar you declare is matched through the scalar it extends. `scalar Age
extends int32` maps to `int`.

Avro has no unsigned integer, so `uint32` and `uint64` are refused. Widening
them would change what you wrote.

## Diagnostics

| Code                          | When                                          |
| ----------------------------- | --------------------------------------------- |
| `tsp-avro/namespace-required` | A record has no Avro namespace above it.      |
| `tsp-avro/invalid-name`       | A name breaks the Avro name rules.            |
| `tsp-avro/unsupported-type`   | A type has no Avro form yet.                  |
| `tsp-avro/unsupported-field`  | A property is optional, or carries a default. |
| `tsp-avro/enum-member-value`  | An enum member carries a value of its own.    |

Every diagnostic is an error. An error stops every write, so one compile
writes the schemas you asked for or writes none. A part of a schema is still a
valid schema, and a schema registry would accept it.

## Licence

MIT

[avro]: https://avro.apache.org/
[protobuf]: https://typespec.io/docs/emitters/protobuf/reference/
