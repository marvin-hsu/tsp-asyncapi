---
title: "範例"
description: "這個 repository 的 [`examples/`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples) 底下有十五個完整範例。每個目錄有三個檔案：TypeSpec 原始碼、編譯時用的 `tspconfig.yam..."
---

# 範例

這個 repository 的 [`examples/`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples) 底下有十五個完整範例。每個目錄有三個檔案：TypeSpec 原始碼、編譯時用的 `tspconfig.yaml`，以及 emitter 產生的 `asyncapi.yaml`。

輸出已經 commit，所以不必執行任何東西就能對照輸入與輸出。十五份都通過官方 AsyncAPI parser。

## 範例一覽

| 範例                                                                                                                | 內容                                                                            |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Hello world](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/01-hello-world)                         | 最小可用的完整文件。只有 `@service` 與 `@info`。                                |
| [Payload schemas](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/02-payload-schemas)                 | schema 層的各種形狀：model、scalar、enum、陣列、record，以及它們的限制。        |
| [Schema composition](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/03-schema-composition)           | 用既有 schema 組出新 schema 的四種方式，以及 `@jsonSchemaExtension` 逃生口。    |
| [Message metadata](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/04-message-metadata)               | payload 周邊的一切：headers、correlation id、範例、tag 與連結。                 |
| [Channels and parameters](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/05-channels-and-parameters) | channel id、位址模板，以及位址宣告的參數。                                      |
| [Servers and security](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/06-servers-and-security)       | server、server 變數，以及 server 提供的安全機制。                               |
| [Request and reply](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/07-request-and-reply)             | 三個 operation，以及 AsyncAPI 回覆的兩種形態。                                  |
| [Kafka user signup](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/08-kafka-user-signup)             | 一份真實的 Kafka 契約，四層 Kafka binding 齊全，另有 Avro 與 Protobuf payload。 |
| [MQTT bindings](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/09-protocol-bindings)                 | 三個 MQTT decorator，以及通用 `@binding` 現在唯一適用的名稱類型。               |
| [Streetlights](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/10-streetlights-kafka)                 | AsyncAPI 官方經典範例的 TypeSpec 版。                                           |
| [Multiple protocols](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/11-multi-protocol)               | 同一個應用、同一個 payload model，同時走 Kafka、WebSocket 與 SQS。              |
| [HTTP callbacks](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/12-http-callbacks)                   | webhook 上的 HTTP binding，包含回覆的 `statusCode`。                            |
| [Enterprise brokers](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/13-enterprise-brokers)           | AMQP、JMS、IBM MQ 與 Anypoint MQ 用四種方式描述同一個目的地。                   |
| [Streaming platforms](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/14-streaming-platforms)         | NATS、Pulsar、Google Cloud Pub/Sub 與 Solace，以及各自的必填欄位。              |
| [規格擴充](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/15-specification-extensions)               | 規格留給作者自己填的 `x-` 欄位，四種能承載它的物件各一例。                      |
| [Protobuf payload](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/16-protobuf-payloads)              | 兩個 Protobuf package 走 RabbitMQ，`.proto` 檔案與文件一起輸出。                |

## 執行其中一個

複製這個 repository，然後在想看的目錄裡編譯：

```bash
git clone https://github.com/marvin-hsu/tsp-asyncapi.git
cd tsp-asyncapi
pnpm install && pnpm build
cd examples/01-hello-world
pnpm exec tsp compile .
```

emitter 會把 `asyncapi.yaml` 寫在 `main.tsp` 旁邊，覆蓋 repository 裡的那一份。接著用 `git diff` 就能看出你建置出來的結果和 commit 的是否一致。

::: tip
每份 `main.tsp` 開頭都是 `import "../..";`，指向這個 repository 的根目錄。在你自己的專案裡，改為依賴套件並寫 `import "tsp-asyncapi";`。
:::
