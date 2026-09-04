# tsp-asyncapi

[![npm](https://img.shields.io/npm/v/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)
[![downloads](https://img.shields.io/npm/dm/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)
[![Node.js](https://img.shields.io/node/v/tsp-asyncapi)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TypeSpec 的 [AsyncAPI](https://www.asyncapi.com/) emitter，可產出符合 AsyncAPI 3.1
規格的文件。支援 channel、operation、message、schema、server、security scheme，
以及各通訊協定的 binding。

> **注意：** 目前在 `0.x`，次版本可能帶破壞性變更，CHANGELOG 會在該筆條目開頭標明。

## 快速開始

安裝：

```bash
npm install tsp-asyncapi
```

`tspconfig.yaml`：

```yaml
emit:
  - "tsp-asyncapi"
```

`main.tsp`：

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

編譯：

```bash
tsp compile .
```

產出 `tsp-output/tsp-asyncapi/asyncapi.yaml`：

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

## Emitter 選項

逐項說明見[參考文件][options]。

| 選項                   | 型別       | 預設值          | 作用                             |
| ---------------------- | ---------- | --------------- | -------------------------------- |
| `output-file`          | `string`   | `asyncapi.yaml` | 輸出檔名                         |
| `file-type`            | `string`   | `yaml`          | `yaml` 或 `json`                 |
| `asyncapi-id`          | `string`   | 無              | 文件的 `id` 欄位                 |
| `default-content-type` | `string`   | 無              | 對應 `defaultContentType`        |
| `preview-features`     | `string[]` | `[]`            | 開啟預覽功能：`protobuf`、`avro` |

## 其他

- [文件](https://tsp-asyncapi.marvinhsu.dev/)
- [GitHub repo](https://github.com/marvin-hsu/tsp-asyncapi)

English: [README.md](./README.md)

## 授權

MIT

[options]: https://tsp-asyncapi.marvinhsu.dev/reference/emitter-options
