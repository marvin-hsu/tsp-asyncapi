# 範例

每個目錄都有 `main.tsp`、編譯時用的 `tspconfig.yaml`，以及 emitter 寫出的 `asyncapi.yaml`。輸出已經 commit，不需要執行任何東西就能對照著讀。

要重新產生其中一個，在該目錄裡執行編譯器：

```bash
cd examples/01-hello-world
pnpm exec tsp compile .
```

每份 `main.tsp` 開頭的 `import "../.."` 指向這個 repository 的根目錄。在你自己的專案裡，改為依賴套件並寫 `import "tsp-asyncapi";`。

| 範例                                                          | 內容                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`01-hello-world`](./01-hello-world/)                         | 最小可用的完整文件。                                               |
| [`02-payload-schemas`](./02-payload-schemas/)                 | schema 層的各種形狀與限制。                                        |
| [`03-schema-composition`](./03-schema-composition/)           | 用既有 schema 組出新 schema 的四種方式。                           |
| [`04-message-metadata`](./04-message-metadata/)               | payload 周邊的所有中繼資料。                                       |
| [`05-channels-and-parameters`](./05-channels-and-parameters/) | channel id、位址模板與位址參數。                                   |
| [`06-servers-and-security`](./06-servers-and-security/)       | server、server 變數與安全機制。                                    |
| [`07-request-and-reply`](./07-request-and-reply/)             | AsyncAPI 回覆的兩種形態。                                          |
| [`08-kafka-user-signup`](./08-kafka-user-signup/)             | 一份真實的 Kafka 契約，四層 binding 齊全。                         |
| [`09-protocol-bindings`](./09-protocol-bindings/)             | MQTT binding，以及通用 `@binding` 現在的適用範圍。                 |
| [`10-streetlights-kafka`](./10-streetlights-kafka/)           | AsyncAPI 官方經典範例的 TypeSpec 版。                              |
| [`11-multi-protocol`](./11-multi-protocol/)                   | 同一個應用同時走 Kafka、WebSocket 與 SQS。                         |
| [`12-http-callbacks`](./12-http-callbacks/)                   | webhook 上的 HTTP binding，包含回覆的 `statusCode`。               |
| [`13-enterprise-brokers`](./13-enterprise-brokers/)           | AMQP、JMS、IBM MQ 與 Anypoint MQ 用四種方式描述同一個目的地。      |
| [`14-streaming-platforms`](./14-streaming-platforms/)         | NATS、Pulsar、Google Cloud Pub/Sub 與 Solace，以及各自的必填欄位。 |
