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

A preview feature changes the emitted document. `protobuf` has a provider in this release. A model that carries the official `TypeSpec.Protobuf` decorators then gets the proto3 text of its whole package as its message payload.

`avro` is reserved and has no provider yet. Asking for it reports `preview-feature-unavailable`, and no file is written. Asking for both names is refused the same way, because the document would still leave out what `avro` asked for.

::: warning
Nothing is emitted when a preview feature is refused. A document written next to the error would ignore the request without saying so.
:::

A name is reserved before the feature behind it exists. Reserving it early means a project that writes the name gets an answer about the feature, not a schema error about an unknown value.
