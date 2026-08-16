/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect } from "vitest";
import { emitAsyncAPI } from "../utils/test-host.js";

describe("AsyncAPI emitted document", () => {
  it("should describe a service with a send and a receive operation end to end", async () => {
    // This is the Phase 5 milestone case. It carries a service, a server, a
    // channel, a message, and both actions.
    const doc = await emitAsyncAPI(`
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

    expect(doc.operations).toEqual({
      sendOrderCreated: {
        action: "send",
        channel: { $ref: "#/channels/OrderChannel" },
        title: "Publish an order event",
        description: "Sends one event for every order a customer places.",
        messages: [{ $ref: "#/channels/OrderChannel/messages/OrderCreated" }],
      },
      onOrderCreated: {
        action: "receive",
        channel: { $ref: "#/channels/OrderChannel" },
        title: "Consume an order event",
        messages: [{ $ref: "#/channels/OrderChannel/messages/OrderCreated" }],
      },
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a request and reply exchange end to end", async () => {
    const doc = await emitAsyncAPI(`
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

    expect(doc.operations.createOrder.reply).toEqual({
      address: { location: "$message.header#/replyTo", description: "The reply topic." },
      channel: { $ref: "#/channels/ReplyChannel" },
      messages: [{ $ref: "#/channels/ReplyChannel/messages/OrderAccepted" }],
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe one Kafka topic end to end", async () => {
    const doc = await emitAsyncAPI(`
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

    expect(doc.channels).toEqual({
      OrderChannel: {
        address: "orders.{region}.created",
        title: "Order events",
        description: "Every order a customer places lands here.",
        servers: [{ $ref: "#/servers/kafka-prod" }],
        parameters: {
          region: { enum: ["eu", "us"], description: "The region the order was placed in." },
        },
        messages: { OrderCreated: { $ref: "#/components/messages/OrderCreated" } },
      },
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should validate a channel that carries every optional field", async () => {
    const doc = await emitAsyncAPI(`
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
    expect(doc.channels.OrderChannel.parameters).toEqual({
      region: {
        default: "eu",
        description: "The region the order was placed in.",
        examples: ["eu", "us"],
        location: "$message.header#/region",
      },
      tenant: { location: "$message.payload#" },
    });
    expect(doc.channels.OrderChannel.tags).toEqual([{ name: "orders" }]);
    expect(doc.channels.OrderChannel.externalDocs).toEqual({
      url: "https://example.com/orders",
      description: "How order events are routed.",
    });
    await expect(doc).toBeValidAsyncAPI();
  });

  it("should describe a channel with an unknown address", async () => {
    const doc = await emitAsyncAPI(`
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

    expect(doc.channels.replies.address).toBeNull();
    await expect(doc).toBeValidAsyncAPI();
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
});
