# tsp-avro

**Experimental.** This package emits [Apache Avro][avro] schema files from
TypeSpec. It is version 0.1.0, and its public surface may change in any
release. Pin an exact version if you depend on it.

It is the Avro counterpart of [`@typespec/protobuf`][protobuf]. It is not an
AsyncAPI package: it declares its own decorators, registers its own `$onEmit`,
and writes `.avsc` files.

## Status

The package is a skeleton. It registers the library and the emitter, and the
emitter writes no file yet. The decorators and the schema walk come next.

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

## Licence

MIT

[avro]: https://avro.apache.org/
[protobuf]: https://typespec.io/docs/emitters/protobuf/reference/
