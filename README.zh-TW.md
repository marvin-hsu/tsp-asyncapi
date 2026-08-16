# tsp-asyncapi

[English](./README.md) | 繁體中文

[TypeSpec](https://typespec.io/) 的 [AsyncAPI 3.1](https://www.asyncapi.com/) emitter。用 TypeSpec 描述事件驅動 API，並產出完整的 AsyncAPI 文件。

> **狀態：即將發佈初版 (M4)。** 產生器目前可輸出完整的 AsyncAPI 3.1 文件。Channels、operations、messages、schemas、servers、security schemes 以及 protocol bindings（包含 Kafka）皆已實作，並可通過官方的 AsyncAPI 驗證器檢查。多檔案輸出與跨檔案 `$ref` 的元件共用機制仍在開發中。

📖 **文件請看 [docs 網站](https://marvin-hsu.github.io/tsp-asyncapi/)**：快速開始、經過驗證的 schema 轉換範例、完整的 decorator / 選項 / 診斷參考。提供英文與臺灣正體中文。

## 環境需求

- Node.js >= 20
- [pnpm](https://pnpm.io/)（本專案的 `devEngines` 欄位鎖定 ^11）

## 安裝

在你的 TypeSpec 專案中安裝這個 emitter：

```bash
pnpm add tsp-asyncapi
```

## 使用方式

在 `main.tsp` 匯入這個 library，用提供的 decorator 標註你的 service：

```typespec
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Order Service API" })
@info(#{ version: "1.0.0", description: "A sample event-driven order API." })
@securityScheme("kafka-scram", #{ type: "scramSha512" })
@useSecurity("kafka-scram")
@server("production", #{ host: "kafka.example.com:9092", protocol: "kafka-secure" })
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
@useServer("production")
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

接著編譯：

```bash
tsp compile . --emit tsp-asyncapi
```

以下是上面範例的輸出。官方 AsyncAPI parser 讀這份文件不會產生任何 error：

```yaml
asyncapi: 3.1.0
info:
  title: Order Service API
  version: 1.0.0
  description: A sample event-driven order API.
servers:
  production:
    host: kafka.example.com:9092
    protocol: kafka-secure
    security:
      - $ref: "#/components/securitySchemes/kafka-scram"
channels:
  OrderChannel:
    address: orders.created
    description: Every order a customer places lands here.
    servers:
      - $ref: "#/servers/production"
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
operations:
  sendOrderCreated:
    action: send
    channel:
      $ref: "#/channels/OrderChannel"
    title: Publish an order event
    messages:
      - $ref: "#/channels/OrderChannel/messages/OrderCreated"
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/OrderChannel"
    title: Consume an order event
    messages:
      - $ref: "#/channels/OrderChannel/messages/OrderCreated"
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
  securitySchemes:
    kafka-scram:
      type: scramSha512
```

operation 透過自己的 channel 參照 message，不會直接指向 `components.messages`。AsyncAPI 3 規定必須是這種形式。

## Emitter 選項

在 `tspconfig.yaml` 設定，或透過 CLI 參數傳入：

| 選項                   | 型別     | 預設值          | 說明                                                          |
| ---------------------- | -------- | --------------- | ------------------------------------------------------------- |
| `output-file`          | `string` | `asyncapi.yaml` | 輸出檔案的名稱。                                              |
| `file-type`            | `string` | `yaml`          | 輸出格式：`yaml` 或 `json`。                                  |
| `asyncapi-id`          | `string` | -               | 文件的全域識別碼，對應 `id` 欄位。                            |
| `default-content-type` | `string` | -               | 訊息 payload 的預設 content type，對應 `defaultContentType`。 |

## Schema 轉換

這個 emitter 會自動把 TypeSpec 的 model、scalar、enum、union 轉換成 AsyncAPI Schema Object。目前支援：

- Model，包含巢狀 model、array、`Record<T>`。
- Scalar，包含 TypeSpec 內建的數值/字串/日期 scalar，以及使用者自訂的衍生 scalar。
- Enum 與 union，包含字串字面值 union 與 `T | null`。
- 繼承（`extends`）與 `@discriminator`，對應到 `allOf` 與 `discriminator` 欄位。
- 驗證關鍵字：`@minLength`、`@maxLength`、`@minValue`、`@maxValue`、`@minItems`、`@maxItems`、`@pattern` 等相關 decorator。
- 文件：`@doc`、`@summary`、`@example`。
- `@encodedName`，用來改寫屬性的線上格式（wire-format）key。
- Template 具現化的穩定命名（依參數推導），例如 `Page<string>` 會在 `components.schemas` 裡變成 `PageString`。

兩個宣告的名稱撞在一起時，會回報一個 diagnostic 錯誤，不會自動幫任一方改名。

## 可用的 Decorator

- `@AsyncAPI.info` — 設定完整的 AsyncAPI `info` 區塊：version、description、contact、license。
- `@AsyncAPI.externalDocs` — 附加外部文件連結。
- `@AsyncAPI.oneOf` — 標註在 union 上，輸出 `oneOf` 取代預設的 `anyOf`。
- `@AsyncAPI.jsonSchemaExtension` — 加入一個沒有專屬 decorator 對照的 JSON Schema 關鍵字，例如 `@jsonSchemaExtension("unevaluatedProperties", false)`。可重複套用，每次加一組 key/value。
- `@AsyncAPI.channel` / `@AsyncAPI.dynamicChannel` — 在 interface 或 namespace 上宣告一個 channel。
- `@AsyncAPI.send` / `@AsyncAPI.receive` — 把一個 operation 標記成本應用送出或接收的 message。
- `@AsyncAPI.replyChannel` / `@AsyncAPI.replyAddress` — 描述 operation 的回覆。見文件站台的 Request 與 Reply 一章。
- `@AsyncAPI.message` — 把 model 標記為一個 message。
- `@AsyncAPI.server` / `@AsyncAPI.useServer` / `@AsyncAPI.serverVariable` — 宣告並參照 server 設定。
- `@AsyncAPI.securityScheme` / `@AsyncAPI.useSecurity` — 宣告並套用安全機制 (security schemes)。
- `@AsyncAPI.binding` — 加上通用的 protocol binding 設定。
- `@AsyncAPI.kafkaServer` / `@AsyncAPI.kafkaChannel` / `@AsyncAPI.kafkaOperation` / `@AsyncAPI.kafkaMessage` — 加上 Kafka 專屬的 binding 設定。
- `@tag` — 內建。為文件加上標準 tag。
- `@service` — 內建。自動取出 API 標題。

## 開發

```bash
pnpm install        # 安裝依賴。
pnpm build          # 編譯 TypeScript 到 dist/。
pnpm watch          # watch 模式編譯。
pnpm test           # 執行測試（vitest）。
pnpm lint           # 執行 eslint。
pnpm format         # 執行 prettier。
pnpm docs:dev       # 在本機啟動文件站台（VitePress）。
pnpm docs:build     # 建置文件站台。
```

文件站台放在 `docs/`，以 [VitePress](https://vitepress.dev/) 建置。提供英文與臺灣正體中文。push 到 `main` 會部署到 GitHub Pages。

其他工具：

- **api-extractor** — 追蹤公開 API 介面（`pnpm api-extractor:local`）。
- **knip** — 找出未使用的程式碼與依賴（`pnpm knip`）。
- **husky + lint-staged** — 每次 commit 前執行 lint 與 format 檢查。

## 授權

[MIT](./LICENSE)
