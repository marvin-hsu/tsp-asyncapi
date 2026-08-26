# tsp-asyncapi

[![npm](https://img.shields.io/npm/v/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)
[![downloads](https://img.shields.io/npm/dm/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)
[![Node.js](https://img.shields.io/node/v/tsp-asyncapi)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An [AsyncAPI](https://www.asyncapi.com/) emitter for TypeSpec. It writes an
AsyncAPI 3.1 document covering channels, operations, messages, schemas,
servers, security schemes, and the protocol bindings.

> **Note:** Still `0.x`, so a minor release may carry a breaking change. The
> changelog marks any entry that does.

## Quick start

Install:

```bash
npm install tsp-asyncapi
```

`tspconfig.yaml`:

```yaml
emit:
  - "tsp-asyncapi"
```

`main.tsp`:

```typespec
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Orders" })
namespace Orders;

@message
model OrderPlaced {
  orderId: string;
}

@channel("orders")
interface Events {
  @send op placed(event: OrderPlaced): void;
}
```

Compile:

```bash
tsp compile .
```

That writes `tsp-output/tsp-asyncapi/asyncapi.yaml`:

```yaml
asyncapi: 3.1.0
info:
  title: Orders
  version: 0.0.0
channels:
  orders:
    address: orders
    messages:
      OrderPlaced:
        $ref: "#/components/messages/OrderPlaced"
operations:
  placed:
    action: send
    channel:
      $ref: "#/channels/orders"
    messages:
      - $ref: "#/channels/orders/messages/OrderPlaced"
components:
  schemas:
    OrderPlaced:
      type: object
      properties:
        orderId:
          type: string
      required:
        - orderId
  messages:
    OrderPlaced:
      name: OrderPlaced
      payload:
        $ref: "#/components/schemas/OrderPlaced"
```

## Emitter options

The [reference][options] describes each one.

| Option                 | Type       | Default         | Effect                         |
| ---------------------- | ---------- | --------------- | ------------------------------ |
| `output-file`          | `string`   | `asyncapi.yaml` | Name of the emitted file       |
| `file-type`            | `string`   | `yaml`          | `yaml` or `json`               |
| `asyncapi-id`          | `string`   | none            | The `id` field of the document |
| `default-content-type` | `string`   | none            | Maps to `defaultContentType`   |
| `preview-features`     | `string[]` | `[]`            | Turns on `protobuf` or `avro`  |

## More

- [Documentation](https://marvin-hsu.github.io/tsp-asyncapi/)
- [GitHub repository](https://github.com/marvin-hsu/tsp-asyncapi)

Traditional Chinese: [README.zh-TW.md](./README.zh-TW.md)

## License

MIT

[options]: https://marvin-hsu.github.io/tsp-asyncapi/reference/emitter-options
