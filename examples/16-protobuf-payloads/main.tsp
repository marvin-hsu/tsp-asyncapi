// One contract, two emitters, two Protobuf packages, one RabbitMQ broker.
// The models below carry the official `TypeSpec.Protobuf` decorators. The
// official emitter writes them out as `.proto` files. This emitter reads the
// same decorators and writes proto3 text of its own into the AsyncAPI
// payloads, so the document and the `.proto` files describe one wire format.
//
// The `protobuf` preview feature turns that on. It is set in
// `tspconfig.yaml`, and it is off by default.
import "tsp-asyncapi";
import "@typespec/protobuf";

using AsyncAPI;

// Protobuf describes the data. It does not describe the broker, the
// channels, the direction of a message, or the operations. So `@server`,
// `@channel`, `@send` and `@message` are still written here.
@service(#{ title: "Orders Service" })
@info(#{
  version: "1.0.0",
  description: "Order and billing events, carried as protobuf over RabbitMQ.",
})
@server(
  "production",
  #{
    host: "rabbit.example.com:5672",
    protocol: "amqp",
    title: "RabbitMQ",
    description: "The production broker. Publishing needs the orders vhost.",
  }
)
namespace OrdersService;

// Headers travel beside the payload, so they are not part of a proto
// message. Protobuf has no way to say "this field is somewhere else": every
// property of a message takes a field number. So a `@header` on a
// `@Protobuf.message` model is an error, and the headers get a model of
// their own instead.
//
// This model sits outside both packages and carries no `@Protobuf.message`.
// It reaches no `.proto` file, and the document describes it as JSON Schema.
// A Multi Format Schema Object takes a different format in each slot, which
// is what lets one message carry a proto3 payload and JSON Schema headers.
// Both packages point at this one model.
/** What every message of this application carries beside its payload. */
model EventHeaders {
  /** Ties every message of one request together. */
  `x-correlation-id`: string;

  /** The application that published the message. */
  `x-source`: string;
}

// `@Protobuf.package` marks a namespace that becomes one `.proto` file. The
// name in it is the `package` declaration of that file, and it is
// independent of the TypeSpec namespace name. Two packages here become two
// files, and the payloads below never mix them up.
@Protobuf.package({ name: "com.example.orders" })
namespace Orders {
  /**
   * An amount of money, as the smallest unit of one currency.
   */
  // No `@AsyncAPI.message` here: this model is not a message of the
  // document. It still reaches the emitted payloads, because `OrderPlaced`
  // names it in a field, and a payload carries every declaration its
  // message reaches.
  @Protobuf.message
  model Money {
    @Protobuf.field(1)
    currency: string;

    @Protobuf.field(2)
    amount: int64;
  }

  /**
   * One order a customer placed.
   */
  // Two decorators named `message` are in scope. The AsyncAPI one marks a
  // model as a message of the document. The Protobuf one marks it as a
  // message of the `.proto` file. The Protobuf one is written qualified.
  @message
  @headers(EventHeaders)
  @Protobuf.message
  // An example carries the headers as well as the payload. The headers are
  // JSON Schema and the payload is proto3, so an example shows a reader what
  // each half looks like on its own terms.
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "checkout" },
      payload: #{ orderId: "ord-1001", total: #{ currency: "TWD", amount: 249000 } },
    },
    #{ name: "typical-order", summary: "One order, paid in TWD." }
  )
  model OrderPlaced {
    @Protobuf.field(1)
    orderId: string;

    @Protobuf.field(2)
    total: Money;
  }

  /**
   * One order that left the warehouse.
   */
  @message
  @headers(EventHeaders)
  @Protobuf.message
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "warehouse" },
      payload: #{ orderId: "ord-1001", carrier: "black-cat" },
    },
    #{ name: "shipped-order" }
  )
  model OrderShipped {
    @Protobuf.field(1)
    orderId: string;

    @Protobuf.field(2)
    carrier: string;
  }
}

// A second package. Its file, its `package` line, and its payloads are all
// separate from the orders package.
@Protobuf.package({ name: "com.example.billing" })
namespace Billing {
  /**
   * One invoice issued for an order.
   */
  @message
  @headers(EventHeaders)
  @Protobuf.message
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "billing" },
      payload: #{ invoiceId: "inv-31", orderId: "ord-1001", amountCents: 249000 },
    },
    #{ name: "issued-invoice" }
  )
  model InvoiceIssued {
    @Protobuf.field(1)
    invoiceId: string;

    @Protobuf.field(2)
    orderId: string;

    @Protobuf.field(3)
    amountCents: int64;
  }
}

// The payload of a message is a proto3 text that stands on its own: the
// `syntax` line, the `package` line, the message itself, and whatever that
// message reaches through its fields. A declaration the message never
// reaches is left out, so the payload's message is the one message nothing
// else references. That is how a Protobuf reader finds the root.
//
// `OrderPlaced` reaches `Money`, so its payload carries both declarations.
// `OrderShipped` reaches nothing, so its payload carries itself alone.

// The channel is a topic exchange, said with an AMQP channel binding.
@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "orders", type: "topic", durable: true, vhost: "/orders" },
})
@channel("order.placed")
interface Placed {
  // Persistent delivery, said with an AMQP operation binding. `deliveryMode`
  // is 1 for transient and 2 for persistent.
  @amqpOperation(#{ deliveryMode: 2, mandatory: true, timestamp: true })
  @send
  op placed(event: Orders.OrderPlaced): void;
}

@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "orders", type: "topic", durable: true, vhost: "/orders" },
})
@channel("order.shipped")
interface Shipped {
  @amqpOperation(#{ deliveryMode: 2, timestamp: true })
  @send
  op shipped(event: Orders.OrderShipped): void;
}

@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "billing", type: "topic", durable: true, vhost: "/orders" },
})
@channel("invoice.issued")
interface Issued {
  @amqpOperation(#{ deliveryMode: 2 })
  @send
  op issued(event: Billing.InvoiceIssued): void;
}
