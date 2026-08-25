# tsp-avro

**Experimental.** This package emits [Apache Avro][avro] schema files from
TypeSpec. It is pre-1.0. Its public surface can change in any release. Pin an
exact version if you depend on it.

It is the Avro counterpart of [`@typespec/protobuf`][protobuf]. It is not an
AsyncAPI package: it declares its own decorators, registers its own `$onEmit`,
and writes `.avsc` files.

The [Avro Schemas guide][guide] holds the same material with a worked example.

## Install

```bash
npm install tsp-avro
```

## Use

```yaml
# tspconfig.yaml
emit:
  - "tsp-avro"

options:
  "tsp-avro":
    emitter-output-dir: "{project-root}/schemas"
```

The emitter takes no option of its own. `emitter-output-dir` is a compiler
option, and every emitter takes it.

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

## Write both reserved decorator names in backticks

TypeSpec reserves the words `namespace` and `record`. Write
`` @Avro.`namespace` `` and `` @Avro.`record` `` with backticks around the
name. Without them the compiler reports `reserved-identifier`.

The upstream Protobuf library writes `` @Protobuf.`package` `` the same way,
for the same reason.

## Decorators

| Decorator                         | Target                           | What it does                                                         |
| --------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| ``@Avro.`namespace`(name)``       | `Namespace`                      | Declares the Avro namespace. The nearest ancestor that has one wins. |
| `` @Avro.`record` ``              | `Model`                          | Marks a model to emit. One marked model becomes one `.avsc` file.    |
| `@Avro.aliases(...names)`         | `Model`, `ModelProperty`, `Enum` | Names what the declaration used to be called.                        |
| `@Avro.order(mode)`               | `ModelProperty`                  | `ascending`, `descending` or `ignore`.                               |
| `@Avro.fixed(size)`               | `Model`, `Scalar`                | Makes an Avro fixed type of that many bytes.                         |
| `@Avro.logicalType(name)`         | `Scalar`, `ModelProperty`        | Writes one of the logical types the specification defines.           |
| `@Avro.decimal(precision, scale)` | `Scalar`, `ModelProperty`        | Writes the `decimal` logical type with its parameters.               |
| `@Avro.enumDefault(member)`       | `Enum`                           | Names the symbol a reader falls back to.                             |

Documentation comes from the native `/** */` comment. A field default comes
from the native `= value`. There is no decorator for either.

## Optional properties and defaults

Avro has no optional field. A field that may be absent is a union with null.
A union carries a default only if the default matches its first branch. So the
`?` and the `= value` of TypeSpec decide the shape together.

| TypeSpec           | Avro                                                   |
| ------------------ | ------------------------------------------------------ |
| `x: string`        | `{"name":"x","type":"string"}`                         |
| `x?: string`       | `{"name":"x","type":["null","string"],"default":null}` |
| `x: string = "a"`  | `{"name":"x","type":"string","default":"a"}`           |
| `x?: string = "a"` | `{"name":"x","type":["string","null"],"default":"a"}`  |

The last row reverses the order. The author wrote a default that is not null,
so null cannot lead.

Write a union with `|`. A union inside a union is flattened, because Avro
allows neither nesting nor a repeated branch. A named type is compared by its
full name, and every other branch by its Avro type name.

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

## Logical types

A logical type is an attribute of a type rather than a type of its own. The
table below is what `@Avro.logicalType` accepts, and it is the table the Avro
specification defines. A pair outside it is refused.

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

`decimal` takes a precision and a scale, so it has a decorator of its own.
Write `@Avro.decimal(precision, scale)` rather than
`@Avro.logicalType("decimal")`.

## What it refuses

Each of these reports a diagnostic rather than a translation.

- A model that extends another model.
- An anonymous model.
- A template instance, such as `Box<string>`.
- A model that holds an index signature and fields together.
- A scalar outside the table above.
- A union that names one type twice, such as `string[] | int32[]`.
- Two declarations that resolve to one Avro full name.

## Diagnostics

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

Every diagnostic is an error. An error stops every write, so one compile
writes the schemas you asked for or writes none. A part of a schema is still a
valid schema, and a schema registry would accept it.

## Licence

MIT

[avro]: https://avro.apache.org/
[protobuf]: https://typespec.io/docs/emitters/protobuf/reference/
[guide]: https://marvin-hsu.github.io/tsp-asyncapi/guide/avro-schemas
