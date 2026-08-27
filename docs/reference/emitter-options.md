---
title: "Emitter Options"
description: 'Set these in `tspconfig.yaml`, or pass them on the CLI with `--option "tsp-asyncapi.<name>=<value>"`.'
---

# Emitter Options

Set these in `tspconfig.yaml`, or pass them on the CLI with `--option "tsp-asyncapi.<name>=<value>"`.

| Option                 | Type               | Default                                                        | Effect                                                                                                      |
| ---------------------- | ------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `file-type`            | `"yaml" \| "json"` | `yaml`                                                         | Serialization format of the document.                                                                       |
| `output-file`          | `string`           | `asyncapi.yaml`, or `asyncapi.json` when `file-type` is `json` | Name of the emitted file, written under `tsp-output/tsp-asyncapi/`.                                         |
| `asyncapi-id`          | `string`           | (omitted)                                                      | Emitted as the document's top-level `id` field — the application's global identifier, conventionally a URN. |
| `default-content-type` | `string`           | (omitted)                                                      | Emitted as `defaultContentType` — the content type message payloads use when a message declares none.       |
| `preview-features`     | `string[]`         | `[]`                                                           | Turns on preview features. The reserved names are `protobuf` and `avro`.                                    |

Options the schema declares but you don't set are omitted from the document entirely, not emitted as empty values.

## Via `tspconfig.yaml`

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    output-file: "orders.yaml"
    file-type: "yaml"
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

## Via the CLI

```bash
tsp compile . --emit tsp-asyncapi \
  --option "tsp-asyncapi.file-type=json" \
  --option "tsp-asyncapi.asyncapi-id=urn:com:example:orders"
```

An unknown option name fails validation (`additionalProperties: false`), so a typo is caught at compile time rather than silently ignored. A name in `preview-features` that is not reserved fails the same way, and the message lists the names that are.

## Preview features

A preview feature changes the emitted document. Two names are reserved: `protobuf` and `avro`. Both work in this release. A name with no provider behind it reports `preview-feature-unavailable`, and no file is written. A request that names one working feature and one unavailable one is refused the same way, because the request as a whole cannot be answered.

`protobuf` gives a model that carries the official `TypeSpec.Protobuf` decorators a proto3 payload. The [Protobuf payloads guide](../guide/protobuf-payloads) shows what it writes.

`avro` gives a model that carries the `tsp-avro` `@Avro.avroRecord` decorator an Avro payload. The payload is written as an object, because Avro is JSON. `tsp-avro` is an optional peer dependency of the emitter. Install it in the project that turns this feature on.

Both features can be on at once. One model may carry only one of the two sets of decorators. A model that carries both is reported as `conflicting-generated-schema-source`, and no file is written.

::: warning
Nothing is emitted when a preview feature is refused. A document written next to the error would ignore the request without saying so.
:::
