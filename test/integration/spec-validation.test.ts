import { describe, it, expect } from "vitest";
import { emitDocument } from "../utils/test-host.js";
import {
  channelsOf,
  messagesOf,
  operationsOf,
  present,
  resolveParameters,
  resolveTags,
  serversOf,
} from "../utils/document.js";
import type { MultiFormatSchemaObject, SqsChannelBindingObject } from "#emitter/types/index.js";
import { bindingFor, bindingsOf } from "../utils/document.js";

describe("AsyncAPI emitted document", () => {
  it("should describe a service with a send and a receive operation end to end", async () => {
    // This is the Phase 5 milestone case. It carries a service, a server, a
    // channel, a message, and both actions.
    const doc = await emitDocument(`
      @service(#{ title: "Order Service" })
      @info(#{ version: "1.0.0" })
      @server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace OrderService;

      @message
      @doc("An order a customer placed.")
      model OrderCreated {
        @header
        correlationId: string;

        orderId: string;
        total: float64;
      }

      @channel("orders.created")
      @doc("Every order a customer places lands here.")
      @useServer("kafka-prod")
      interface OrderChannel {
        @send
        @summary("Publish an order event")
        @doc("Sends one event for every order a customer places.")
        op sendOrderCreated(event: OrderCreated): void;

        @receive
        @summary("Consume an order event")
        op onOrderCreated(): OrderCreated;
      }
    `);

    expect(operationsOf(doc)).toEqual({
      sendOrderCreated: {
        action: "send",
        channel: { $ref: "#/channels/orders.created" },
        title: "Publish an order event",
        description: "Sends one event for every order a customer places.",
        messages: [{ $ref: "#/channels/orders.created/messages/OrderCreated" }],
      },
      onOrderCreated: {
        action: "receive",
        channel: { $ref: "#/channels/orders.created" },
        title: "Consume an order event",
        messages: [{ $ref: "#/channels/orders.created/messages/OrderCreated" }],
      },
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a request and reply exchange end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Order Service" })
      @server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace OrderService;

      @message
      model CreateOrder {
        orderId: string;
      }

      @message
      model OrderAccepted {
        orderId: string;
      }

      @dynamicChannel
      interface ReplyChannel {}

      @channel("orders.create")
      interface OrderChannel {
        @send
        @replyChannel(ReplyChannel)
        @replyAddress("$message.header#/replyTo", "The reply topic.")
        op createOrder(command: CreateOrder): OrderAccepted;
      }
    `);

    expect(operationsOf(doc).createOrder.reply).toEqual({
      address: { location: "$message.header#/replyTo", description: "The reply topic." },
      channel: { $ref: "#/channels/ReplyChannel" },
      messages: [{ $ref: "#/channels/ReplyChannel/messages/OrderAccepted" }],
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe one Kafka topic end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace TestService;

      @message
      @doc("An order a customer placed.")
      model OrderCreated {
        @header
        correlationId: string;

        orderId: string;
        total: float64;
      }

      @channel("orders.{region}.created")
      @summary("Order events")
      @doc("Every order a customer places lands here.")
      @useServer("kafka-prod")
      interface OrderChannel {
        publish(
          @doc("The region the order was placed in.")
          region: "eu" | "us",

          event: OrderCreated,
        ): void;
      }
    `);

    expect(channelsOf(doc)).toEqual({
      "orders.{region}.created": {
        address: "orders.{region}.created",
        title: "Order events",
        description: "Every order a customer places lands here.",
        servers: [{ $ref: "#/servers/kafka-prod" }],
        parameters: { region: { $ref: "#/components/parameters/region" } },
        messages: { OrderCreated: { $ref: "#/components/messages/OrderCreated" } },
      },
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a Kafka contract with all four bindings end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      @kafkaServer(#{
        schemaRegistryUrl: "https://registry.example.com",
        schemaRegistryVendor: "confluent",
      })
      namespace TestService;

      @kafkaMessage(#{
        key: #{ type: "string" },
        schemaIdLocation: "payload",
        schemaIdPayloadEncoding: "apicurio-new",
        schemaLookupStrategy: "TopicIdStrategy",
      })
      @message
      model OrderCreated {
        orderId: string;
      }

      @kafkaChannel(#{
        topic: "orders.created",
        partitions: 12,
        replicas: 3,
        topicConfiguration: #{ \`cleanup.policy\`: #["compact"] },
      })
      @channel("orders.created")
      @useServer("kafka-prod")
      interface OrderChannel {
        @kafkaOperation(#{ groupId: #{ type: "string" }, clientId: #{ type: "string" } })
        @receive
        op onOrderCreated(): OrderCreated;
      }
    `);

    expect(serversOf(doc)["kafka-prod"].bindings).toEqual({
      kafka: {
        schemaRegistryUrl: "https://registry.example.com",
        schemaRegistryVendor: "confluent",
        bindingVersion: "0.5.0",
      },
    });
    expect(channelsOf(doc)["orders.created"].bindings).toEqual({
      kafka: {
        topic: "orders.created",
        partitions: 12,
        replicas: 3,
        topicConfiguration: { "cleanup.policy": ["compact"] },
        bindingVersion: "0.5.0",
      },
    });
    expect(operationsOf(doc).onOrderCreated.bindings).toEqual({
      kafka: {
        groupId: { type: "string" },
        clientId: { type: "string" },
        bindingVersion: "0.5.0",
      },
    });
    expect(messagesOf(doc).OrderCreated.bindings).toEqual({
      kafka: {
        key: { type: "string" },
        schemaIdLocation: "payload",
        schemaIdPayloadEncoding: "apicurio-new",
        schemaLookupStrategy: "TopicIdStrategy",
        bindingVersion: "0.5.0",
      },
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a WebSocket handshake end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Events" })
      @server("ws-prod", #{ host: "events.example.com", protocol: "ws" })
      namespace TestService;

      @message
      model Tick {
        at: utcDateTime;
      }

      @websocketChannel(#{
        method: "GET",
        query: #{ type: "object", properties: #{ token: #{ type: "string" } } },
        headers: #{ type: "object", properties: #{ \`X-Api-Key\`: #{ type: "string" } } },
      })
      @channel("/ticks")
      @useServer("ws-prod")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    // The member is `ws`. The official parser is the authority on that name,
    // so this test asserts the shape and then hands the document to it.
    expect(channelsOf(doc)["/ticks"].bindings).toEqual({
      ws: {
        method: "GET",
        query: { type: "object", properties: { token: { type: "string" } } },
        headers: { type: "object", properties: { "X-Api-Key": { type: "string" } } },
        bindingVersion: "0.1.0",
      },
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe an MQTT contract with all three bindings end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Sensors" })
      @mqttServer(#{
        clientId: "sensor-gateway",
        cleanSession: true,
        lastWill: #{ topic: "sensors/status", qos: 1, message: "offline", retain: true },
        keepAlive: 60,
        sessionExpiryInterval: 3600,
      })
      @server("mqtt-prod", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
      namespace TestService;

      @mqttMessage(#{
        payloadFormatIndicator: 1,
        contentType: "application/json",
        responseTopic: "sensors/ack",
      })
      @message
      model Reading {
        value: float64;
      }

      @channel("sensors/readings")
      @useServer("mqtt-prod")
      interface Readings {
        @mqttOperation(#{ qos: 2, retain: true, messageExpiryInterval: 300 })
        @send
        op publish(event: Reading): void;
      }
    `);

    expect(bindingsOf(serversOf(doc)["mqtt-prod"].bindings).mqtt.lastWill).toEqual({
      topic: "sensors/status",
      qos: 1,
      message: "offline",
      retain: true,
    });
    expect(bindingsOf(operationsOf(doc).publish.bindings).mqtt.qos).toBe(2);
    expect(bindingsOf(messagesOf(doc).Reading.bindings).mqtt.payloadFormatIndicator).toBe(1);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe an AMQP topology end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Events" })
      @server("rabbit", #{ host: "rabbit.example.com:5672", protocol: "amqp" })
      namespace TestService;

      @amqpMessage(#{ contentEncoding: "gzip", messageType: "event.created" })
      @message
      model EventCreated {
        id: string;
      }

      @amqpChannel(#{
        \`is\`: "routingKey",
        exchange: #{ name: "events", type: "topic", durable: true },
      })
      @channel("events.created")
      @useServer("rabbit")
      interface EventChannel {
        @amqpOperation(#{ deliveryMode: 2, expiration: 60000, cc: #["events.audit"] })
        @send
        op publish(event: EventCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["events.created"].bindings).amqp.exchange).toEqual({
      name: "events",
      type: "topic",
      durable: true,
    });
    expect(bindingsOf(operationsOf(doc).publish.bindings).amqp.deliveryMode).toBe(2);
    expect(bindingsOf(messagesOf(doc).EventCreated.bindings).amqp.contentEncoding).toBe("gzip");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe an HTTP request and reply end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Notices" })
      @server("api", #{ host: "api.example.com", protocol: "https" })
      namespace TestService;

      @httpMessage(#{
        headers: #{ type: "object", properties: #{ \`X-Trace-Id\`: #{ type: "string" } } },
        statusCode: 201,
      })
      @message
      model Notice {
        body: string;
      }

      @channel("/notices")
      @useServer("api")
      interface Notices {
        @httpOperation(#{
          method: "POST",
          query: #{ type: "object", properties: #{ since: #{ type: "string" } } },
        })
        @send
        op publish(event: Notice): void;
      }
    `);

    expect(bindingsOf(operationsOf(doc).publish.bindings).http.method).toBe("POST");
    expect(bindingsOf(messagesOf(doc).Notice.bindings).http.statusCode).toBe(201);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a NATS and Pulsar contract end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @pulsarServer(#{ tenant: "orders" })
      @server("pulsar", #{ host: "pulsar.example.com:6650", protocol: "pulsar" })
      namespace TestService;

      @message
      model OrderCreated {
        id: string;
      }

      @pulsarChannel(#{
        \`namespace\`: "orders",
        persistence: "persistent",
        retention: #{ time: 1440, size: 1000 },
      })
      @channel("orders.created")
      @useServer("pulsar")
      interface OrderChannel {
        @natsOperation(#{ queue: "orders-workers" })
        @receive
        op onOrderCreated(): OrderCreated;
      }
    `);

    expect(bindingsOf(channelsOf(doc)["orders.created"].bindings).pulsar.namespace).toBe("orders");
    expect(bindingsOf(operationsOf(doc).onOrderCreated.bindings).nats.queue).toBe("orders-workers");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a Google Cloud Pub/Sub topic end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("pubsub", #{ host: "pubsub.googleapis.com", protocol: "googlepubsub" })
      namespace TestService;

      @googlePubSubMessage(#{
        orderingKey: "customer-id",
        schema: #{ name: "projects/p/schemas/order" },
      })
      @message
      model OrderCreated {
        orderId: string;
      }

      @googlePubSubChannel(#{
        schemaSettings: #{ encoding: "json", name: "projects/p/schemas/order" },
        labels: #{ team: "orders" },
        messageRetentionDuration: "86400s",
      })
      @channel("orders-created")
      @useServer("pubsub")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // `schemaSettings` is required. The parser is the authority on that, so
    // the document goes to it rather than only to a shape assertion here.
    expect(
      bindingsOf(channelsOf(doc)["orders-created"].bindings).googlepubsub.schemaSettings,
    ).toEqual({
      encoding: "json",
      name: "projects/p/schemas/order",
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe an Amazon SQS queue end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("sqs", #{ host: "sqs.eu-west-1.amazonaws.com", protocol: "sqs" })
      namespace TestService;

      @message
      model OrderCreated {
        orderId: string;
      }

      @sqsChannel(#{
        queue: #{ name: "orders", fifoQueue: false, visibilityTimeout: 30 },
        deadLetterQueue: #{ name: "orders-dlq", fifoQueue: false },
      })
      @channel("orders")
      @useServer("sqs")
      interface OrderChannel {
        @sqsOperation(#{ queues: #[#{ name: "orders", fifoQueue: false }] })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // A binding is an untyped record in the document type, so the test names
    // the protocol shape it expects.
    const sqsChannel = bindingFor(channelsOf(doc).orders.bindings, "sqs") as
      SqsChannelBindingObject | undefined;
    expect(present(sqsChannel, "sqs channel binding").queue.name).toBe("orders");
    expect(bindingsOf(operationsOf(doc).publish.bindings).sqs.queues).toHaveLength(1);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe an IBM MQ and JMS contract end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @ibmMqServer(#{ groupId: "PRODCLSTR1", heartBeatInterval: 300 })
      @server("mq", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
      namespace TestService;

      @ibmMqMessage(#{ type: "jms", expiry: 60000 })
      @jmsMessage(#{ headers: #{ type: "object" } })
      @message
      model OrderCreated {
        id: string;
      }

      @ibmMqChannel(#{
        destinationType: "queue",
        queue: #{ objectName: "ORDERS.QUEUE" },
        maxMsgLength: 4194304,
      })
      @jmsChannel(#{ destination: "orders", destinationType: "queue" })
      @channel("orders")
      @useServer("mq")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(channelsOf(doc).orders.bindings).ibmmq.destinationType).toBe("queue");
    expect(bindingsOf(channelsOf(doc).orders.bindings).jms.destination).toBe("orders");
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe an Anypoint MQ and Solace contract end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @solaceServer(#{ msgVpn: "orders-vpn", clientName: "order-service" })
      @server("solace", #{ host: "solace.example.com:55555", protocol: "smf" })
      namespace TestService;

      @anypointMqMessage(#{ headers: #{ type: "object" } })
      @message
      model OrderCreated {
        id: string;
      }

      @anypointMqChannel(#{ destination: "orders", destinationType: "queue" })
      @channel("orders")
      @useServer("solace")
      interface OrderChannel {
        @solaceOperation(#{
          destinations: #[
            #{ destinationType: "queue", deliveryMode: "persistent", queue: #{ name: "orders" } }
          ],
          timeToLive: 60000,
        })
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(bindingsOf(serversOf(doc).solace.bindings).solace.msgVpn).toBe("orders-vpn");
    expect(bindingsOf(operationsOf(doc).publish.bindings).solace.destinations).toHaveLength(1);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should validate a channel that carries every optional field", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace TestService;

      @message
      model OrderCreated {
        @header
        region: string;

        orderId: string;
      }

      @channel("orders.{region}.{tenant}.created")
      @asyncTag("orders")
      @externalDocs("https://example.com/orders", "How order events are routed.")
      interface OrderChannel {
        publish(
          @doc("The region the order was placed in.")
          @example("eu")
          @example("us")
          @parameterLocation("$message.header#/region")
          region: string = "eu",

          @parameterLocation("$message.payload#")
          tenant: string,

          event: OrderCreated,
        ): void;
      }
    `);

    // `location` is the field with the least room for error. It reaches the
    // document as a bare string, and the AsyncAPI JSON Schema is what
    // decides whether the '#' this emitter insists on is really required. A
    // regex of this emitter's own cannot answer that, so the parser does.
    expect(
      resolveParameters(doc, channelsOf(doc)["orders.{region}.{tenant}.created"].parameters),
    ).toEqual({
      region: {
        default: "eu",
        description: "The region the order was placed in.",
        examples: ["eu", "us"],
        location: "$message.header#/region",
      },
      tenant: { location: "$message.payload#" },
    });
    expect(resolveTags(doc, channelsOf(doc)["orders.{region}.{tenant}.created"].tags)).toEqual([
      { name: "orders" },
    ]);
    expect(channelsOf(doc)["orders.{region}.{tenant}.created"].externalDocs).toEqual({
      url: "https://example.com/orders",
      description: "How order events are routed.",
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a channel with an unknown address", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace TestService;

      @message
      model OrderAccepted {
        orderId: string;
      }

      @dynamicChannel("replies")
      interface ReplyChannel {
        receive(response: OrderAccepted): void;
      }
    `);

    expect(channelsOf(doc).replies.address).toBeNull();
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a message whose payload is an Avro schema", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace TestService;

      @message
      @contentType("application/avro")
      @rawPayload(
        "application/vnd.apache.avro;version=1.9.0",
        #{
          type: "record",
          name: "OrderCreated",
          \`namespace\`: "com.example",
          fields: #[
            #{ name: "orderId", type: "string" },
            #{ name: "total", type: "double" }
          ]
        }
      )
      @rawHeaders(
        "application/vnd.apache.avro;version=1.9.0",
        #{
          type: "record",
          name: "OrderCreatedHeaders",
          fields: #[#{ name: "traceId", type: "string" }]
        }
      )
      model OrderCreated {}

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    // The official parser is the judge of the container's shape. Both slots
    // of the Message Object carry the same two-field object.
    expect(messagesOf(doc).OrderCreated.payload).toEqual({
      schemaFormat: "application/vnd.apache.avro;version=1.9.0",
      schema: {
        type: "record",
        name: "OrderCreated",
        namespace: "com.example",
        fields: [
          { name: "orderId", type: "string" },
          { name: "total", type: "double" },
        ],
      },
    });
    // A message's `headers` may be a schema, a reference, or a multi-format
    // schema. Only the last of the three carries `schemaFormat`, which is what
    // this test is about.
    const headers = present(messagesOf(doc).OrderCreated.headers, "OrderCreated headers");
    expect((headers as MultiFormatSchemaObject).schemaFormat).toBe(
      "application/vnd.apache.avro;version=1.9.0",
    );
    // The raw schema is written into the message, so the document carries no
    // components.schemas entry at all. Read directly rather than through
    // `schemasOf`: absence is the outcome under test, and the reader throws.
    expect(doc.components?.schemas).toBeUndefined();
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should carry x- extensions on all four objects end to end", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @extension("x-owner", "orders-team")
      namespace TestService;

      @message
      @extension("x-schema-id", 4711)
      model OrderCreated {
        orderId: string;
      }

      @channel("orders.created")
      @extension("x-retention", #{ days: 7, compacted: true })
      interface OrderChannel {
        @send
        @extension("x-tags", #["critical", "public"])
        op publish(event: OrderCreated): void;
      }
    `);

    // The parser rejects an unknown field on any of these objects, so it is
    // the judge of whether an `x-` field is allowed where the emitter put it.
    await expect(doc).toBeValidAsyncAPI();
    expect(doc.info["x-owner"]).toBe("orders-team");
    expect(channelsOf(doc)["orders.created"]["x-retention"]).toEqual({ days: 7, compacted: true });
    expect(operationsOf(doc).publish["x-tags"]).toEqual(["critical", "public"]);
    expect(messagesOf(doc).OrderCreated["x-schema-id"]).toBe(4711);
  });
});

describe("AsyncAPI spec validation helper", () => {
  // Shared by the two tests that check how a dangling $ref is reported.
  const docWithMissingRef = {
    asyncapi: "3.1.0",
    info: { title: "Broken", version: "1.0.0" },
    channels: {
      orders: {
        address: "orders",
        messages: { placed: { $ref: "#/components/messages/missing" } },
      },
    },
  };

  it("should accept a minimal valid document", async () => {
    await expect({
      asyncapi: "3.1.0",
      info: { title: "Valid", version: "1.0.0" },
    }).toBeValidAsyncAPI();
  });

  it("should accept a document given as a YAML string", async () => {
    await expect(`asyncapi: 3.1.0\ninfo:\n  title: Valid\n  version: 1.0.0\n`).toBeValidAsyncAPI();
  });

  it("should reject a document without the asyncapi version field", async () => {
    await expect({ info: { title: "Broken", version: "1.0.0" } }).toBeInvalidAsyncAPI(
      /asyncapi-is-asyncapi/,
    );
  });

  it("should reject a document without a required info field", async () => {
    await expect({ asyncapi: "3.1.0", info: { title: "Broken" } }).toBeInvalidAsyncAPI(
      /must have required property "version"/,
    );
  });

  it("should reject a reference to a component that does not exist", async () => {
    await expect(docWithMissingRef).toBeInvalidAsyncAPI(/invalid-ref/);
  });

  it("should report the path of the offending node", async () => {
    await expect(docWithMissingRef).toBeInvalidAsyncAPI(
      /channels\/orders\/messages\/placed\/\$ref/,
    );
  });

  it("should accept a document that only raises non-error diagnostics", async () => {
    // Version 3.0.0 raises the informational asyncapi-latest-version rule. It stays valid.
    await expect({
      asyncapi: "3.0.0",
      info: { title: "Older", version: "1.0.0" },
    }).toBeValidAsyncAPI();
  });

  it("should reject a document that declares AsyncAPI 2.x", async () => {
    await expect({
      asyncapi: "2.6.0",
      info: { title: "Old", version: "1.0.0" },
      channels: {},
    }).toBeInvalidAsyncAPI(/major version 3/);
  });

  it("should reject a document given as a YAML string that declares AsyncAPI 2.x", async () => {
    await expect(
      `asyncapi: 2.6.0\ninfo:\n  title: Old\n  version: 1.0.0\nchannels: {}\n`,
    ).toBeInvalidAsyncAPI(/major version 3/);
  });

  it("should reject an empty document", async () => {
    await expect(null).toBeInvalidAsyncAPI(/got nothing/);
  });

  /**
   * The Avro payload of a message reaches the Avro schema parser.
   *
   * Without that parser an Avro payload gets a structural check alone, and any
   * object at all passes one. The two cases below are the proof that the
   * parser is registered and that it reads what it is given: the same document
   * is valid with a legal record in it and invalid with a record that has no
   * name.
   */
  const documentWithAvroPayload = (schema: unknown): unknown => ({
    asyncapi: "3.1.0",
    info: { title: "Orders", version: "1.0.0" },
    channels: {
      orders: {
        address: "orders",
        messages: { placed: { $ref: "#/components/messages/placed" } },
      },
    },
    components: {
      messages: {
        placed: {
          name: "placed",
          payload: {
            schemaFormat: "application/vnd.apache.avro;version=1.9.0",
            schema,
          },
        },
      },
    },
  });

  it("should accept a message whose Avro payload is a legal record", async () => {
    await expect(
      documentWithAvroPayload({
        type: "record",
        name: "OrderPlaced",
        namespace: "com.example.orders",
        fields: [{ name: "orderId", type: "string" }],
      }),
    ).toBeValidAsyncAPI();
  });

  it("should reject a message whose Avro payload is a record with no name", async () => {
    await expect(
      documentWithAvroPayload({ type: "record", fields: [{ name: "orderId", type: "string" }] }),
    ).toBeInvalidAsyncAPI(/must have required property "name"/);
  });
});
