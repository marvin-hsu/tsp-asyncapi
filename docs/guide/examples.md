---
title: "Examples"
description: "Seventeen worked examples live in the repository, under [`examples/`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples). Each directory..."
---

# Examples

Seventeen worked examples live in the repository, under [`examples/`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples). Each directory holds the TypeSpec source and the `tspconfig.yaml` it was compiled with. Sixteen of them also hold the `asyncapi.yaml` the emitter wrote from that source. The Protobuf example holds the `.proto` files the official emitter wrote. The Avro example holds the `.avsc` files `tsp-avro` wrote, and no document.

The output is committed, so you can read an input and its output side by side without running anything. Every one of the sixteen documents passes the official AsyncAPI parser.

## The examples

| Example                                                                                                               | What it shows                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [Hello world](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/01-hello-world)                           | The smallest document the emitter can produce. `@service` and `@info`, and nothing else.                                            |
| [Payload schemas](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/02-payload-schemas)                   | The shapes of the schema layer: models, scalars, enums, arrays, records, and the constraints on them.                               |
| [Schema composition](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/03-schema-composition)             | Four ways to build one schema out of others, plus the `@jsonSchemaExtension` escape hatch.                                          |
| [Message metadata](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/04-message-metadata)                 | Everything that sits around a payload: headers, correlation ids, examples, tags and links.                                          |
| [Channels and parameters](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/05-channels-and-parameters)   | Channel ids, templated addresses, and the parameters an address declares.                                                           |
| [Servers and security](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/06-servers-and-security)         | Servers, server variables, and the security schemes a server offers.                                                                |
| [Request and reply](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/07-request-and-reply)               | Three operations, and the two shapes an AsyncAPI reply can take.                                                                    |
| [Kafka user signup](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/08-kafka-user-signup)               | One realistic Kafka contract, with all four Kafka bindings on one document. It also carries an Avro payload and a Protobuf payload. |
| [MQTT bindings](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/09-protocol-bindings)                   | The three MQTT decorators, and the one kind of name the generic `@binding` still carries.                                           |
| [Streetlights](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/10-streetlights-kafka)                   | The canonical AsyncAPI example, written in TypeSpec.                                                                                |
| [Multiple protocols](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/11-multi-protocol)                 | One application over Kafka, WebSocket and SQS, from one payload model.                                                              |
| [HTTP callbacks](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/12-http-callbacks)                     | The HTTP bindings on a webhook, including the `statusCode` of a reply.                                                              |
| [Enterprise brokers](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/13-enterprise-brokers)             | AMQP, JMS, IBM MQ and Anypoint MQ describing one destination four ways.                                                             |
| [Streaming platforms](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/14-streaming-platforms)           | NATS, Pulsar, Google Cloud Pub/Sub and Solace, and the fields each one requires.                                                    |
| [Specification extensions](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/15-specification-extensions) | The `x-` fields the specification leaves to the author, on all four objects that take one.                                          |
| [Protobuf payloads](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/16-protobuf-payloads)               | Two Protobuf packages over RabbitMQ, with the `.proto` files emitted next to the document.                                          |
| [Avro schemas](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/17-avro-schemas)                         | One order domain written as Avro schema files by `tsp-avro`. No AsyncAPI document.                                                  |

## Running one

Clone the repository and compile inside the directory you want:

```bash
git clone https://github.com/marvin-hsu/tsp-asyncapi.git
cd tsp-asyncapi
pnpm install && pnpm build
cd examples/01-hello-world
pnpm exec tsp compile .
```

The emitter writes `asyncapi.yaml` next to `main.tsp`, overwriting the copy in the repository. `git diff` then shows whether your build produces what was committed.

::: tip
Every `main.tsp` starts with `import "../..";`, which points at the root of this repository. In your own project, depend on the package and write `import "tsp-asyncapi";` instead.
:::
