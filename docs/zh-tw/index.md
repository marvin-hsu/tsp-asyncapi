---
layout: home

hero:
  name: TypeSpec AsyncAPI
  text: AsyncAPI 3.1 emitter
  tagline: 用 TypeSpec 描述事件驅動 API，並產出 AsyncAPI 3.1 文件。
  actions:
    - theme: brand
      text: 快速開始
      link: /zh-tw/guide/getting-started
    - theme: alt
      text: Schema 轉換參考
      link: /zh-tw/guide/schema-conversion/models
    - theme: alt
      text: GitHub
      link: https://github.com/marvin-hsu/tsp-asyncapi

features:
  - title: 產出 AsyncAPI 3.1 文件
    details: 支援 channel、operation、message、schema、server 與 security scheme。輸出通過官方 AsyncAPI 驗證器。
  - title: 支援多種通訊協定
    details: Kafka、MQTT、AMQP、WebSocket、HTTP、NATS、Pulsar、Google Pub/Sub、Amazon SQS、Anypoint MQ、JMS、IBM MQ、Solace。
  - title: 支援 Protobuf 與 Avro payload
    details: 除了產出 AsyncAPI 文件，可同時產生 .proto／.avsc 定義檔。
---
