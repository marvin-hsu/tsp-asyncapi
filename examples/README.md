# Examples

Each directory holds a `main.tsp`, the `tspconfig.yaml` it was compiled with, and the `asyncapi.yaml` the emitter wrote. The output is committed, so you can read the pair without running anything.

To regenerate one, run the compiler inside its directory:

```bash
cd examples/01-hello-world
pnpm exec tsp compile .
```

The `import "../.."` at the top of every `main.tsp` points at the root of this repository. In your own project, depend on the package and write `import "tsp-asyncapi";` instead.

| Example                                                       | What it shows                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`01-hello-world`](./01-hello-world/)                         | The smallest document the emitter can produce.                                   |
| [`02-payload-schemas`](./02-payload-schemas/)                 | The shapes of the schema layer, and the constraints on them.                     |
| [`03-schema-composition`](./03-schema-composition/)           | Four ways to build one schema out of others.                                     |
| [`04-message-metadata`](./04-message-metadata/)               | Everything that sits around a payload.                                           |
| [`05-channels-and-parameters`](./05-channels-and-parameters/) | Channel ids, templated addresses and address parameters.                         |
| [`06-servers-and-security`](./06-servers-and-security/)       | Servers, server variables and security schemes.                                  |
| [`07-request-and-reply`](./07-request-and-reply/)             | The two shapes of an AsyncAPI reply.                                             |
| [`08-kafka-user-signup`](./08-kafka-user-signup/)             | One realistic Kafka contract, with all four Kafka bindings.                      |
| [`09-protocol-bindings`](./09-protocol-bindings/)             | The MQTT bindings, and where the generic `@binding` still applies.               |
| [`10-streetlights-kafka`](./10-streetlights-kafka/)           | The canonical AsyncAPI example, written in TypeSpec.                             |
| [`11-multi-protocol`](./11-multi-protocol/)                   | One application over Kafka, WebSocket and SQS.                                   |
| [`12-http-callbacks`](./12-http-callbacks/)                   | The HTTP bindings on a webhook, including the `statusCode` of a reply.           |
| [`13-enterprise-brokers`](./13-enterprise-brokers/)           | AMQP, JMS, IBM MQ and Anypoint MQ describing one destination four ways.          |
| [`14-streaming-platforms`](./14-streaming-platforms/)         | NATS, Pulsar, Google Cloud Pub/Sub and Solace, and the fields each one requires. |
