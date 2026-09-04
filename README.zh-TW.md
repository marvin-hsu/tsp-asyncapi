# tsp-asyncapi

| 套件                                                                                                        | 版本                                                                                                          | 下載量                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi) — AsyncAPI 3.1 emitter                         | [![npm](https://img.shields.io/npm/v/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)           | [![downloads](https://img.shields.io/npm/dm/tsp-asyncapi.svg)](https://www.npmjs.com/package/tsp-asyncapi)           |
| [`tsp-asyncapi-core`](https://www.npmjs.com/package/tsp-asyncapi-core) — decorator 與語意模型，不含 emitter | [![npm](https://img.shields.io/npm/v/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core) | [![downloads](https://img.shields.io/npm/dm/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core) |
| [`tsp-avro`](https://www.npmjs.com/package/tsp-avro) — Apache Avro schema emitter，實驗性質                 | [![npm](https://img.shields.io/npm/v/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)                   | [![downloads](https://img.shields.io/npm/dm/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)                   |

[![Node.js](https://img.shields.io/node/v/tsp-asyncapi)](https://nodejs.org/)
[![GitHub stars](https://img.shields.io/github/stars/marvin-hsu/tsp-asyncapi.svg?style=flat)](https://github.com/marvin-hsu/tsp-asyncapi/stargazers)

[![CI](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/ci.yml/badge.svg)](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/ci.yml)
[![Release](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/release.yml/badge.svg?event=workflow_dispatch)](https://github.com/marvin-hsu/tsp-asyncapi/actions/workflows/release.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=coverage)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=tsp-asyncapi&metric=bugs)](https://sonarcloud.io/summary/new_code?id=tsp-asyncapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<a href='https://ko-fi.com/N4R6257TGG' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

[English](./README.md) | 繁體中文

[TypeSpec](https://typespec.io/) 的 [AsyncAPI 3.1](https://www.asyncapi.com/) emitter。用 TypeSpec 描述事件驅動 API，並產出完整的 AsyncAPI 文件。

> **狀態：已發佈到 npm。** emitter 會輸出一份完整的 AsyncAPI 3.1 文件。
>
> - **已實作：** channel、operation、message、schema、server、security scheme，以及各種通訊協定的 binding（含 Kafka）。輸出通過官方 AsyncAPI 驗證器。
> - **預覽功能：** Protobuf payload 與 Avro payload。
> - **尚未進入 1.0：** 三個套件都是。次版本仍可能改變輸出。

> **說明：** 本專案直接走訪 AST，沒有用 `@typespec/asset-emitter`。TypeSpec 官方正在淘汰那套舊架構（EFv1），改推 EFv2（見 [#5998](https://github.com/microsoft/typespec/issues/5998) 與 [#6583](https://github.com/microsoft/typespec/issues/6583)）。

📖 **完整說明在[文件網站](https://tsp-asyncapi.marvinhsu.dev/)**：快速開始、驗證過的 schema 轉換範例，以及 decorator、選項、診斷的完整參考。

## 環境需求

- Node.js >= 20
- [pnpm](https://pnpm.io/)（`devEngines` 欄位鎖定 ^11）

## 安裝

在 TypeSpec 專案中安裝 emitter：

```bash
pnpm add tsp-asyncapi
```

安裝 `tsp-asyncapi` 後會連帶載入 `tsp-asyncapi-core`，通常不需要自行安裝。

如果需要安裝 Avro emitter：

```bash
pnpm add tsp-avro
```

## 使用方式

在 `main.tsp` 匯入 library，再用 decorator 標註 service：

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

產出如下：

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
  orders.created:
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
  securitySchemes:
    kafka-scram:
      type: scramSha512
```

> **說明：** AsyncAPI 3 規定 operation 要透過 channel 參照 message，不會直接指向 `components.messages`。

## 範例

[`examples/`](./examples/) 底下有十八個完整範例，每個都附 TypeSpec 原始碼與 emitter 實際寫出的輸出。本專案實作的每個通訊協定都至少出現在一個範例裡。

| 範例                                                                | 內容                                        |
| ------------------------------------------------------------------- | ------------------------------------------- |
| [Hello world](./examples/01-hello-world/)                           | 最小可用的完整文件                          |
| [Payload schemas](./examples/02-payload-schemas/)                   | schema 的各種形狀與限制                     |
| [Schema composition](./examples/03-schema-composition/)             | 組合既有 schema 的四種方式                  |
| [Message metadata](./examples/04-message-metadata/)                 | headers、correlation id、範例、tag          |
| [Channels and parameters](./examples/05-channels-and-parameters/)   | channel id、位址模板與參數                  |
| [Servers and security](./examples/06-servers-and-security/)         | server、變數與安全機制                      |
| [Request and reply](./examples/07-request-and-reply/)               | 回覆的兩種形態                              |
| [Kafka user signup](./examples/08-kafka-user-signup/)               | 完整的 Kafka 契約，四層 binding             |
| [MQTT bindings](./examples/09-protocol-bindings/)                   | MQTT binding 與通用 `@binding`              |
| [Streetlights](./examples/10-streetlights-kafka/)                   | AsyncAPI 官方經典範例的 TypeSpec 版         |
| [Multiple protocols](./examples/11-multi-protocol/)                 | 同一個 payload 同時走 Kafka、WebSocket、SQS |
| [HTTP callbacks](./examples/12-http-callbacks/)                     | webhook 的 HTTP binding                     |
| [Enterprise brokers](./examples/13-enterprise-brokers/)             | AMQP、JMS、IBM MQ、Anypoint MQ              |
| [Streaming platforms](./examples/14-streaming-platforms/)           | NATS、Pulsar、Pub/Sub、Solace               |
| [Specification extensions](./examples/15-specification-extensions/) | `x-` 擴充欄位                               |
| [Protobuf payloads](./examples/16-protobuf-payloads/)               | 兩個 Protobuf package，同時輸出 `.proto`    |
| [Avro schemas](./examples/17-avro-schemas/)                         | 只產出 `.avsc`，沒有 AsyncAPI 文件          |
| [Avro payloads](./examples/18-avro-payloads/)                       | 兩個 Avro record，同時輸出 `.avsc`          |

更詳細的說明見[範例頁](https://tsp-asyncapi.marvinhsu.dev/zh-tw/guide/examples)。

## Avro emitter

[`tsp-avro`](./packages/tsp-avro/) 是實驗性套件，還沒到 1.0，介面隨時可能變動。

主要用來支援 AsyncAPI emitter 的 `avro` 預覽功能：model 標上 `@Avro.avroRecord`，payload 就會輸出 Avro schema。開啟方式見 [Avro payload 指南](https://tsp-asyncapi.marvinhsu.dev/zh-tw/guide/avro-payloads)。

也可以單獨使用：有自己的一套 decorator，不必相依 AsyncAPI decorator 就能輸出 `.avsc` 檔案。用法見 [Avro schema 指南](https://tsp-asyncapi.marvinhsu.dev/zh-tw/guide/avro-schemas)。

## Emitter 選項

在 `tspconfig.yaml` 設定，或透過 CLI 參數傳入：

| 選項                   | 型別       | 預設值          | 說明                                                          |
| ---------------------- | ---------- | --------------- | ------------------------------------------------------------- |
| `output-file`          | `string`   | `asyncapi.yaml` | 輸出檔案的名稱。                                              |
| `file-type`            | `string`   | `yaml`          | 輸出格式：`yaml` 或 `json`。                                  |
| `asyncapi-id`          | `string`   | -               | 文件的全域識別碼，對應 `id` 欄位。                            |
| `default-content-type` | `string`   | -               | 訊息 payload 的預設 content type，對應 `defaultContentType`。 |
| `preview-features`     | `string[]` | `[]`            | 開啟預覽功能。保留的名稱是 `protobuf` 與 `avro`。             |

## 預覽功能

> **注意：** 預覽功能的規格都可能在未來改變。

在 `tspconfig.yaml` 的 `preview-features` 開啟。

| 功能       | payload 格式 | 相依套件             | 指南                                                                                 |
| ---------- | ------------ | -------------------- | ------------------------------------------------------------------------------------ |
| `protobuf` | proto3 文字  | `@typespec/protobuf` | [Protobuf payload](https://tsp-asyncapi.marvinhsu.dev/zh-tw/guide/protobuf-payloads) |
| `avro`     | Avro schema  | `tsp-avro`           | [Avro payload](https://tsp-asyncapi.marvinhsu.dev/zh-tw/guide/avro-payloads)         |

兩個相依套件都是選用的 peer dependency，鎖在單一次版本區間。沒開對應功能的專案不必安裝。

有些 TypeSpec 寫法在 proto3 裡沒有對應形式，例如匿名 model、template 具現化、union、`@Protobuf.externRef`。model 用到這些就不會產生 payload，emitter 會報錯並指出是哪一個。

> **注意：** 會產生 payload 的 model 不可以用欄位層級 `@header`，改用 `@headers`。headers 一律是 JSON Schema。

## Schema 轉換

emitter 會把 TypeSpec 的 model、scalar、enum、union 轉成 AsyncAPI Schema Object。目前涵蓋：

- Model，包含巢狀 model、array、`Record<T>`。
- Scalar，包含 TypeSpec 內建的數值/字串/日期 scalar，以及使用者自訂的衍生 scalar。
- Enum 與 union，包含字串字面值 union 與 `T | null`。
- 繼承（`extends`）與 `@discriminator`，對應到 `allOf` 與 `discriminator` 欄位。
- 驗證關鍵字：`@minLength`、`@maxLength`、`@minValue`、`@maxValue`、`@minItems`、`@maxItems`、`@pattern` 等相關 decorator。
- 文件：`@doc`、`@summary`、`@example`。
- `@encodedName`，用來改寫屬性的線上格式（wire-format）key。
- Template 具現化的穩定命名（依參數推導），例如 `Page<string>` 會在 `components.schemas` 裡變成 `PageString`。

兩個宣告撞名時會編譯失敗，並要求使用者修改名稱。

## 可用的 Decorator

這裡有兩套 decorator：AsyncAPI 描述文件，Avro 描述 schema 檔案。

### AsyncAPI decorator

- `@AsyncAPI.info` — 設定完整的 AsyncAPI `info` 區塊：version、description、contact、license。
- `@AsyncAPI.externalDocs` — 附加外部文件連結。
- `@AsyncAPI.extension` — 在 target 產生的 `info`、channel、operation 或 message 物件上加一個 `x-` 規格擴充欄位。可重複套用，每次加一個 key。
- `@AsyncAPI.oneOf` — 標註在 union 上，輸出 `oneOf` 取代預設的 `anyOf`。
- `@AsyncAPI.jsonSchemaExtension` — 加入一個沒有專屬 decorator 對照的 JSON Schema 關鍵字，例如 `@jsonSchemaExtension("unevaluatedProperties", false)`。可重複套用，每次加一組 key/value。
- `@AsyncAPI.channel` / `@AsyncAPI.dynamicChannel` — 在 interface 或 namespace 上宣告一個 channel。
- `@AsyncAPI.send` / `@AsyncAPI.receive` — 把一個 operation 標記成本應用送出或接收的 message。
- `@AsyncAPI.replyChannel` / `@AsyncAPI.replyAddress` — 描述 operation 的回覆。見文件網站的 Request 與 Reply 一章。
- `@AsyncAPI.message` — 把 model 標記為一個 message。
- `@AsyncAPI.server` / `@AsyncAPI.useServer` — 宣告並參照 server。server 變數是 `@server` 設定裡的 `variables` 欄位，不是獨立的 decorator。
- `@AsyncAPI.securityScheme` / `@AsyncAPI.useSecurity` — 宣告並套用安全機制 (security schemes)。
- `@AsyncAPI.binding` — 加上通用的 protocol binding 設定。
- `@AsyncAPI.kafkaServer` / `@AsyncAPI.kafkaChannel` / `@AsyncAPI.kafkaOperation` / `@AsyncAPI.kafkaMessage` — 加上 Kafka 專屬的 binding 設定。
- `@AsyncAPI.websocketChannel` — 加上 WebSocket channel binding。
- `@AsyncAPI.mqttServer` / `@AsyncAPI.mqttOperation` / `@AsyncAPI.mqttMessage` — 加上 MQTT binding。
- `@AsyncAPI.httpOperation` / `@AsyncAPI.httpMessage` — 加上 HTTP binding。
- `@AsyncAPI.amqpChannel` / `@AsyncAPI.amqpOperation` / `@AsyncAPI.amqpMessage` — 加上 AMQP 0-9-1 binding。
- `@AsyncAPI.natsOperation` — 加上 NATS operation binding。
- `@AsyncAPI.pulsarServer` / `@AsyncAPI.pulsarChannel` — 加上 Pulsar binding。
- `@AsyncAPI.googlePubSubChannel` / `@AsyncAPI.googlePubSubMessage` — 加上 Google Cloud Pub/Sub binding。
- `@AsyncAPI.sqsChannel` / `@AsyncAPI.sqsOperation` — 加上 Amazon SQS binding。
- `@AsyncAPI.anypointMqChannel` / `@AsyncAPI.anypointMqMessage` — 加上 Anypoint MQ binding。
- `@AsyncAPI.jmsServer` / `@AsyncAPI.jmsChannel` / `@AsyncAPI.jmsMessage` — 加上 JMS binding。
- `@AsyncAPI.ibmMqServer` / `@AsyncAPI.ibmMqChannel` / `@AsyncAPI.ibmMqMessage` — 加上 IBM MQ binding。
- `@AsyncAPI.solaceServer` / `@AsyncAPI.solaceOperation` — 加上 Solace binding。
- `@tag` — 內建。為文件加上標準 tag。
- `@service` — 內建。自動取出 API 標題。

### Avro decorator

來自 [`tsp-avro`](./packages/tsp-avro/)。一個普通的 TypeSpec model 本身就是合法的
Avro record，所以這幾個 decorator 補的是「Avro 有、但 TypeSpec 講不出來」的部分。

- `@Avro.avroNamespace` — 宣告一個 namespace 的 Avro namespace。由最靠近的上層 namespace 決定，也決定 `.avsc` 檔案寫進哪個目錄。
- `@Avro.avroRecord` — 標記一個要輸出的 model。一個標記產生一個 `.avsc` 檔案。
- `@Avro.aliases` — 指定這個宣告以前叫什麼名字，讓照舊名字寫的 reader 仍然解得到。
- `@Avro.order` — 設定欄位的排序方式：`ascending`、`descending` 或 `ignore`。
- `@Avro.fixed` — 做成指定位元組數的 Avro `fixed` 型別。
- `@Avro.logicalType` — 寫出規格定義的其中一個 logical type，例如 `uuid` 或 `timestamp-millis`。
- `@Avro.decimal` — 設定 `decimal` 的精度與小數位數。
- `@Avro.enumDefault` — 指定 reader 遇到 enum 沒宣告的符號時要採用哪一個成員。

同時帶著 `@Avro.avroRecord` 與 `@AsyncAPI.message` 的 model，在 `avro` 預覽功能
開啟時，文件裡的 payload 也會是 Avro schema。

## Linter 規則

規則在語意分析階段執行，不必執行 emitter，編輯器就會直接標示。

```yaml
# tspconfig.yaml
linter:
  extends:
    - "tsp-asyncapi/recommended"
```

| 規則                               | recommended | 檢查什麼                                                            |
| ---------------------------------- | :---------: | ------------------------------------------------------------------- |
| `missing-service`                  |      ✓      | 有 AsyncAPI 內容卻沒宣告 `@service`。                               |
| `channel-without-operation`        |      ✓      | channel 底下沒有任何 `@send` 或 `@receive`。                        |
| `operation-without-message`        |      ✓      | operation 沒有指名任何 `@message` model。                           |
| `server-protocol-mismatch`         |      ✓      | server binding 的通訊協定跟 server 本身不合。                       |
| `protobuf-content-type-undeclared` |      ✓      | message 宣告 Protobuf content type，卻沒有對應的 Protobuf payload。 |
| `avro-content-type-undeclared`     |      ✓      | message 宣告 Avro content type，卻沒有對應的 Avro payload。         |
| `unused-security-scheme`           |             | 宣告的 security scheme 沒有被任何 `@useSecurity` 用到。             |

每條規則的訊息與修法，見文件網站的 [Linter 規則頁](https://tsp-asyncapi.marvinhsu.dev/zh-tw/reference/linter)。

## 設計取捨

| 項目                      | 支援 | 說明                                                                                                                                              |
| ------------------------- | :--: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typespec/versioning`    | TBD  | 等 TypeSpec 用新的 `when` 語法重做版本控制（[#10551](https://github.com/microsoft/typespec/issues/10551)）。在那之前建議用 Git 分支或目錄分版本。 |
| `traits`                  |  ✗   | TypeSpec 的 `extends`、`is`、spread 已經能重用。`extends` 輸出成 `allOf` 加 `$ref`，`is` 和 spread 展開進 schema。                                |
| 多個 `@service`           |  ✗   | 建議一個應用一份文件，實務上已足夠。多個應用各開一個專案，寫了多個時只輸出第一個。                                                                |
| 文件切成多檔、跨檔 `$ref` |  ✗   | TypeSpec 在原始碼層就能切檔，輸出的文件不需要再切。                                                                                               |

完整代碼見[診斷訊息參考](https://tsp-asyncapi.marvinhsu.dev/zh-tw/reference/diagnostics)。轉換不了的內容一律回報。

## 上游 bug

> **注意：** 不要用 `__proto__` 當成員名稱。

compiler 組 object value 時逐個成員賦值。在 JavaScript 裡，賦值給 `__proto__`
是設定物件的原型，不是新增成員，所以這個成員在任何 decorator 執行前就消失了，
沒有任何錯誤或警告。

```typespec
// emitter 只收到 `ok` 一個成員，另一個不見了。
@extension("x-thing", #{ `__proto__`: "written", ok: 1 })
```

消失的成員如果是 object 或 array，那個值還會變成物件的原型，之後讀取一個
作者從未宣告的名稱，可能拿到這份塞進去的資料。

所有吃 object value 的 decorator 都受影響，`@extension` 與 `@binding` 都在內。
emitter 拿到值時已經被改過，救不回來。

上游追蹤於 [microsoft/typespec#11743](https://github.com/microsoft/typespec/issues/11743)。

## 開發

```bash
pnpm install        # 安裝相依套件。
pnpm build          # 編譯 TypeScript 到 dist/。
pnpm watch          # watch 模式編譯。
pnpm test           # 執行測試（vitest）。
pnpm lint           # 執行 eslint。
pnpm format         # 執行 prettier。
pnpm docs:dev       # 在本機啟動文件網站（VitePress）。
pnpm docs:build     # 建置文件網站。
```

文件網站的原始碼放在 `docs/`，用 [VitePress](https://vitepress.dev/) 建置，英文與臺灣正體中文各一份。推上 `main` 就會部署到 GitHub Pages。

其他工具：

- **api-extractor** — 追蹤公開 API 介面（`pnpm api-extractor:local`）。
- **knip** — 找出沒用到的程式碼與相依套件（`pnpm knip`）。
- **husky + lint-staged** — 每次 commit 前執行 lint 與 format 檢查。

## 授權

[MIT](./LICENSE)
