# tsp-avro

[![npm](https://img.shields.io/npm/v/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)
[![downloads](https://img.shields.io/npm/dm/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)
[![Node.js](https://img.shields.io/node/v/tsp-avro)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An [Apache Avro](https://avro.apache.org/) emitter for TypeSpec. One record
becomes one `.avsc` file. It also backs the `avro` preview feature of
[`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi).

> **Note:** Experimental and pre-1.0. The decorators, the output and the
> diagnostics may change in any release, so pin an exact version if you depend
> on it.

## Quick start

Install:

```bash
npm install tsp-avro
```

`tspconfig.yaml`:

```yaml
emit:
  - "tsp-avro"
```

`main.tsp`:

```typespec
import "tsp-avro";

@Avro.avroNamespace("com.example.orders")
namespace Orders;

@Avro.avroRecord
model OrderPlaced {
  orderId: string;
  quantity: int32;
}
```

Compile:

```bash
tsp compile .
```

That writes `tsp-output/tsp-avro/com/example/orders/OrderPlaced.avsc`:

```json
{
  "type": "record",
  "name": "OrderPlaced",
  "namespace": "com.example.orders",
  "fields": [
    { "name": "orderId", "type": "string" },
    { "name": "quantity", "type": "int" }
  ]
}
```

The Avro namespace decides the directory a file lands in. This emitter has no
options of its own; `emitter-output-dir` is a compiler option every emitter
takes.

## Decorators

| Decorator                         | Target                                     | What it does                                                          |
| --------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `@Avro.avroNamespace(name)`       | `Namespace`                                | Declares the Avro namespace. A record takes the nearest one above it. |
| `@Avro.avroRecord`                | `Model`                                    | Marks a model to emit. One marked model becomes one `.avsc` file.     |
| `@Avro.aliases(...names)`         | `Model`, `ModelProperty`, `Enum`, `Scalar` | Former names, so a reader can read data written before a rename.      |
| `@Avro.order(mode)`               | `ModelProperty`                            | `ascending`, `descending` or `ignore`.                                |
| `@Avro.fixed(size)`               | `Model`, `Scalar`                          | Makes an Avro fixed type of that many bytes.                          |
| `@Avro.logicalType(name)`         | `Scalar`, `ModelProperty`                  | Writes one of the logical types the specification defines.            |
| `@Avro.decimal(precision, scale)` | `Scalar`, `ModelProperty`                  | Writes the `decimal` logical type with its parameters.                |
| `@Avro.enumDefault(member)`       | `Enum`                                     | The member a reader uses when it meets a symbol it does not know.     |

Documentation comes from a `/** */` comment and a field default from
`= value`. Neither needs a decorator.

## More

- [Documentation](https://tsp-asyncapi.marvinhsu.dev/guide/avro-schemas)
- [GitHub repository](https://github.com/marvin-hsu/tsp-asyncapi)

Traditional Chinese: [README.zh-TW.md](./README.zh-TW.md)

## License

MIT
