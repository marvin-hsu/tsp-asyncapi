---
title: "快速開始"
description: "tsp-asyncapi 是 TypeSpec 的 AsyncAPI 3.1 emitter。本頁從安裝開始，產出第一份文件，並說明輸出的每個欄位從哪裡來。"
---

# 快速開始

`tsp-asyncapi` 是 [TypeSpec](https://typespec.io/) 的 [AsyncAPI 3.1](https://www.asyncapi.com/) emitter。本頁從安裝開始，產出第一份文件，並說明輸出的每個欄位從哪裡來。

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
  description: "This is a sample Order Service event-driven API.",
  contact: #{ name: "API Support", email: "support@example.com" },
  license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
})
@tag("orders")
@tag("payment")
@externalDocs("https://example.com/docs", "Service Documentation")
namespace Orders;
```

在 `tspconfig.yaml` 設定 emitter：

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

執行編譯：

```bash
tsp compile .
```

產出 `tsp-output/tsp-asyncapi/asyncapi.yaml`，內容如下：

```yaml
asyncapi: 3.1.0
id: urn:com:example:orders
info:
  title: Order Service API
  version: 1.0.0
  description: This is a sample Order Service event-driven API.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
  tags:
    - $ref: "#/components/tags/payment"
    - $ref: "#/components/tags/orders"
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
defaultContentType: application/json
channels: {}
operations: {}
components:
  tags:
    payment:
      name: payment
    orders:
      name: orders
```

## 每一行從哪來

| 輸出欄位                                                              | 來源                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `id`                                                                  | `tspconfig.yaml` 的 `asyncapi-id` 選項                                                 |
| `info.title`                                                          | `@service(#{ title: ... })`                                                            |
| `info.version`、`description`、`contact`、`license`、`termsOfService` | `@info(#{ ... })`                                                                      |
| `info.description`（備用）                                            | namespace 上的 `@doc` 或 `/** ... */` 文件註解。只在 `@info` 沒給 description 時採用。 |
| `info.tags`                                                           | 每個 `@tag` 產生一筆                                                                   |
| `info.externalDocs`                                                   | `@externalDocs(url, description?)`                                                     |
| `defaultContentType`                                                  | `tspconfig.yaml` 的 `default-content-type` 選項                                        |

寫了多個 `@service` 時以第一個為準，並回報 `multiple-services` 警告。要為多個
service 各產一份文件，建議拆成多個專案、共用同一份 TypeSpec 原始碼。

## 下一步

- 依 [Schema 轉換](./schema-conversion/) 的規則設計事件 payload model。每個寫法都附輸入與實際輸出的對照。
- 到 [Emitter 選項](../reference/emitter-options) 查看所有設定。
- 到 [Decorator](../reference/decorators/) 查看精確的簽章。
- 遇到警告或錯誤時，查 [診斷訊息](../reference/diagnostics)。
