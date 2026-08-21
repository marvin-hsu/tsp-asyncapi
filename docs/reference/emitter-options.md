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

An unknown option name fails validation (`additionalProperties: false`), so a typo is caught at compile time rather than silently ignored.
