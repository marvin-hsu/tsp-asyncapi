// One application, three protocols. This is the thing AsyncAPI does that a
// per-protocol schema cannot: one document describes the same events however
// they travel.
//
// Orders arrive on Kafka. A browser watches them over a WebSocket. A partner
// receives them on a queue. The payload model is declared once, and all three
// carry it.
//
// Read this after example 08 (one Kafka contract) and example 09 (one MQTT
// contract). What is new here is that a binding belongs to an object, not to
// a document. Each server, channel and operation names its own protocol, and
// the emitter never asks the three to agree.
import "../..";

using AsyncAPI;

@service(#{ title: "Order Events" })
@info(#{
  version: "2.0.0",
  description: "Order events, delivered over Kafka, WebSocket and SQS.",
})
// Three servers, three protocols. A channel names the servers it is reachable
// on, so nothing here forces one channel onto all three.
@server(
  "kafka-prod",
  #{ host: "kafka.example.com:9092", protocol: "kafka", title: "Event backbone" }
)
@server(
  "ws-public",
  #{ host: "stream.example.com", protocol: "wss", title: "Public order stream" }
)
@server(
  "sqs-partner",
  #{ host: "sqs.eu-west-1.amazonaws.com", protocol: "sqs", title: "Partner queue" }
)
// A server binding reaches every server this namespace declares, because
// `@server` is repeatable and keyed by name. So a namespace with servers of
// three protocols cannot give one of them a binding of its own.
//
// That is why there is no `@kafkaServer` here. Writing one would put a
// `kafka` member on the WebSocket and SQS servers too, and a reader would
// find a schema registry URL on a queue.
namespace OrderEvents;

/**
 * An order that a customer placed.
 */
// One model, three deliveries. The message binding of each protocol lands on
// this one message object, and each carries the version of its own binding.
@kafkaMessage(#{ key: #{ type: "string" }, schemaIdLocation: "payload" })
@message
model OrderPlaced {
  /** The order this event is about. */
  orderId: string;

  /** The customer who placed it. */
  customerId: string;

  /** What the order came to, in the smallest unit of the currency. */
  amountMinor: int64;

  /** When the customer placed it, in UTC. */
  placedAt: utcDateTime;
}

/**
 * The Kafka topic every order is published to.
 */
// The Kafka channel binding describes the topic itself: how many partitions
// it has, how many replicas, and how the broker retires old records.
@kafkaChannel(#{
  topic: "orders.placed.v2",
  partitions: 12,
  replicas: 3,
  topicConfiguration: #{ `cleanup.policy`: #["delete"], `retention.ms`: 604800000 },
})
@channel("orders.placed")
@useServer("kafka-prod")
interface OrderTopic {
  @kafkaOperation(#{ groupId: #{ type: "string" }, clientId: #{ type: "string" } })
  @send("publishOrderPlaced")
  op publish(event: OrderPlaced): void;
}

/**
 * The stream a browser subscribes to.
 */
// The WebSocket binding describes the handshake, not the messages. `query`
// and `headers` are Schema Objects, and AsyncAPI requires each to be of type
// `object` with a `properties` key. The emitter reports anything else.
//
// WebSocket defines this one object and nothing else. There is no
// `@websocketOperation`, because the specification says the other three
// objects must hold no property.
@websocketChannel(#{
  method: "GET",
  query: #{
    type: "object",
    properties: #{ token: #{ type: "string", description: "A short-lived access token." } },
  },
})
@channel("/streams/orders")
@useServer("ws-public")
interface OrderStream {
  @receive("receiveOrderPlaced")
  op subscribe(): OrderPlaced;
}

/**
 * The queue a partner reads from.
 */
// SQS is the one protocol here with required fields. A channel needs a
// `queue`, and that queue needs a `name` and a `fifoQueue`. Leave either out
// and the emitter reports `missing-binding-field` and drops the whole
// binding, because AsyncAPI would reject the document it would otherwise
// write.
@sqsChannel(#{
  queue: #{
    name: "partner-orders",
    fifoQueue: false,
    visibilityTimeout: 30,
    messageRetentionPeriod: 345600,
  },
  deadLetterQueue: #{ name: "partner-orders-dlq", fifoQueue: false },
})
@channel("partner-orders")
@useServer("sqs-partner")
interface PartnerQueue {
  // The operation binding requires only a `name` on each queue. The channel
  // binding above also requires `fifoQueue`. AsyncAPI states a different
  // required set at each level, and the emitter follows each one where it
  // applies rather than picking the stricter of the two.
  @sqsOperation(#{ queues: #[#{ name: "partner-orders" }] })
  @receive("receivePartnerOrder")
  op consume(): OrderPlaced;
}
