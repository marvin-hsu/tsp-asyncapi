---
title: "快速開始"
description: "安裝 tsp-asyncapi，用 TypeSpec 編譯出第一份 AsyncAPI 3.1 文件。"
---

# 快速開始

`tsp-asyncapi` 是 [TypeSpec](https://typespec.io/) 的 [AsyncAPI 3.1](https://www.asyncapi.com/) emitter。裝好、編譯一個小 service，emitter 就會寫出文件。

## 環境需求

Node.js 20 以上。以下範例用 pnpm，npm 與 yarn 也可以。

## 安裝

在 TypeSpec 專案中安裝：

```bash
pnpm add tsp-asyncapi
```

## 產出第一份 AsyncAPI 文件

建立 `main.tsp`：

```typespec
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Order Service API" })
@info(#{
  version: "1.0.0",
  description: "A sample event-driven order API.",
})
namespace Orders;

@message
@doc("An order a customer placed.")
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
  amount: float64;
}

@channel("orders.created")
@doc("Every order a customer places lands here.")
interface OrderChannel {
  @send
  @summary("Publish an order event")
  op sendOrderCreated(event: OrderCreated): void;

  @receive
  @summary("Consume an order event")
  op onOrderCreated(): OrderCreated;
}
```

在 `tspconfig.yaml` 設定 emitter：

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    output-file: "asyncapi.yaml"
    file-type: "yaml"
```

執行編譯：

```bash
tsp compile .
```

產出 `tsp-output/tsp-asyncapi/asyncapi.yaml`：

```yaml
asyncapi: 3.1.0
info:
  title: Order Service API
  version: 1.0.0
  description: A sample event-driven order API.
channels:
  orders.created:
    address: orders.created
    description: Every order a customer places lands here.
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
operations:
  sendOrderCreated:
    action: send
    channel:
      $ref: "#/channels/orders.created"
    title: Publish an order event
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/orders.created"
    title: Consume an order event
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
components:
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
        amount:
          type: number
          format: double
      required:
        - orderId
        - amount
      description: An order a customer placed.
  messages:
    OrderCreated:
      name: OrderCreated
      description: An order a customer placed.
      headers:
        type: object
        properties:
          correlationId:
            type: string
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
```

## `info` 欄位從哪來

| 輸出欄位                                                              | 來源                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `info.title`                                                          | `@service(#{ title: ... })`                                                            |
| `info.version`、`description`、`contact`、`license`、`termsOfService` | `@info(#{ ... })`                                                                      |
| `info.description`（備用）                                            | namespace 上的 `@doc` 或 `/** ... */` 文件註解。只在 `@info` 沒給 description 時採用。 |
| `info.tags`                                                           | 每個 `@tag` 產生一筆                                                                   |
| `info.externalDocs`                                                   | `@externalDocs(url, description?)`                                                     |
| `id`                                                                  | `tspconfig.yaml` 的 `asyncapi-id` 選項                                                 |
| `defaultContentType`                                                  | `tspconfig.yaml` 的 `default-content-type` 選項                                        |

寫了多個 `@service` 時以第一個為準，並回報 `multiple-services` 警告。要為多個
service 各產一份文件，建議拆成多個專案、共用同一份 TypeSpec 原始碼。

這個區塊上的 decorator 完整列表見 [Document Info](../reference/decorators/document-info)。

## 下一步

- 依 [Schema 轉換](./schema-conversion/) 的規則設計 payload model。
- 到[範例](./examples)看各通訊協定的完整專案。
