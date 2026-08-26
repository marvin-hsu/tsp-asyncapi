// One contract, two emitters, one Avro namespace, one Kafka cluster.
// The models below carry the `tsp-avro` decorators. That emitter writes them
// out as `.avsc` files. This emitter calls the same walk and inlines the
// schema it returns into the AsyncAPI payloads, so the document and the
// files describe one wire format.
//
// The `avro` preview feature turns that on. It is set in `tspconfig.yaml`,
// and it is off by default.
import "tsp-asyncapi";
import "tsp-avro";

using AsyncAPI;

// Avro describes the data. It does not describe the broker, the channels,
// the direction of a message, or the operations. So `@server`, `@channel`,
// `@send` and `@message` are still written here.
@service(#{ title: "Orders Service" })
@info(#{
  version: "1.0.0",
  description: "Order events, carried as Avro over Kafka.",
})
@server(
  "production",
  #{
    host: "kafka.example.com:9092",
    protocol: "kafka",
    title: "Kafka",
    description: "The production cluster. Every payload is registered by subject.",
  }
)
// The schema registry is where a consumer resolves the id it reads off a
// message. The document names it, so a reader knows which registry holds the
// schemas the payloads below carry.
@kafkaServer(#{
  schemaRegistryUrl: "https://registry.example.com",
  schemaRegistryVendor: "confluent",
})
namespace OrdersService;

// `@Avro.avroNamespace` marks the namespace that qualifies every Avro name under
// it. The Avro namespace is independent of the TypeSpec namespace name, and
// it is what a registry subject and a `.avsc` path are built from.
@Avro.avroNamespace("com.example.orders")
namespace Orders {
  // The logical type sits on the scalar, so every field of this type carries
  // it. A reader that knows `timestamp-millis` builds a timestamp. A reader
  // that does not know it reads the `long`, which is what is on the wire.
  /** A moment in time, as the milliseconds since the Unix epoch. */
  @Avro.logicalType("timestamp-millis")
  scalar Timestamp extends int64;

  // No `@AsyncAPI.message` here: this model is not a message of the
  // document. It still reaches both payloads, because both records name it
  // in a field. Avro has no import, so each payload holds a whole copy of
  // it.
  /** Where an order goes. */
  model Address {
    /** The street and the number. */
    line1: string;

    city: string;

    /** The ISO 3166-1 alpha-2 code of the country. */
    country: string;
  }

  /** Why an order was called off. */
  @Avro.enumDefault("Unknown")
  enum CancellationReason {
    Unknown,
    OutOfStock,
    CustomerAsked,
    PaymentFailed,
  }

  // Headers travel beside the payload, so they are not part of the record.
  // Avro has no way to say "this field is somewhere else": every property of
  // a record is a field of it. So a `@header` on a record model is an error,
  // and the headers get a model of their own instead.
  //
  // This model carries no `@Avro.avroRecord`. It is not a record, so it gets
  // no `.avsc` file, and the document describes it as JSON Schema. A
  // Multi Format Schema Object takes a different format in each slot, which
  // is what lets one message carry an Avro payload and JSON Schema headers.
  /** What every message of this application carries beside its payload. */
  model EventHeaders {
    /** Ties every message of one request together. */
    `x-correlation-id`: string;

    /** The application that published the message. */
    `x-source`: string;
  }

  /**
   * One order a customer placed.
   */
  @message
  @contentType("application/vnd.apache.avro")
  @headers(EventHeaders)
  @Avro.avroRecord
  @kafkaMessage(#{ schemaIdLocation: "payload", schemaLookupStrategy: "TopicIdStrategy" })
  // An example carries the headers as well as the payload. The two halves are
  // written in different schema languages, so an example shows a reader what
  // each of them looks like on its own terms. A logical type is written as
  // what is on the wire: a `uuid` is the text of the UUID, and a
  // `timestamp-millis` is the millisecond count.
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-8f21", `x-source`: "checkout" },
      payload: #{
        id: "6b1f7c2e-6f3a-4f52-9c1c-0f0b6a1d3f10",
        placedAt: 1755993600000,
        shipping: #{ line1: "12 Zhongxiao E Rd", city: "Taipei", country: "TW" },
        totalMinorUnits: 249000,
      },
    },
    #{ name: "typical-order", summary: "One order, paid in TWD." }
  )
  model OrderPlaced {
    // `uuid` is written on a string, so what is on the wire is the text of
    // the UUID.
    /** The identifier of the order. */
    @Avro.logicalType("uuid")
    id: string;

    /** When the customer placed the order. */
    placedAt: Timestamp;

    /** Where the order goes. */
    shipping: Address;

    /** What the order came to, in the smallest unit of its currency. */
    totalMinorUnits: int64;
  }

  /**
   * One order the customer or the warehouse called off.
   */
  @message
  @contentType("application/vnd.apache.avro")
  @headers(EventHeaders)
  @Avro.avroRecord
  @kafkaMessage(#{ schemaIdLocation: "payload", schemaLookupStrategy: "TopicIdStrategy" })
  // `returnTo` is optional, so the example leaves it out. An Avro reader
  // takes the default of that field, which is null.
  @messageExample(
    #{
      headers: #{ `x-correlation-id`: "req-4d09", `x-source`: "warehouse" },
      payload: #{
        id: "6b1f7c2e-6f3a-4f52-9c1c-0f0b6a1d3f10",
        cancelledAt: 1756080000000,
        reason: "OutOfStock",
      },
    },
    #{ name: "cancelled-order" }
  )
  model OrderCancelled {
    /** The identifier of the order. */
    @Avro.logicalType("uuid")
    id: string;

    /** When the order was called off. */
    cancelledAt: Timestamp;

    /** Why it was called off. */
    reason: CancellationReason;

    // An optional field is a union with null, and its default is null. Avro
    // reads a default against the first branch of a union alone, so null
    // leads.
    /** Where the refunded goods go back to, when there are any. */
    returnTo?: Address;
  }
}

// The payload of a message is the Avro schema itself, written as an object
// rather than as text. Avro is JSON, and AsyncAPI inlines a schema of a JSON
// based format.

@kafkaChannel(#{ topic: "orders.placed", partitions: 12, replicas: 3 })
@channel("orders.placed")
interface Placed {
  @send
  op placed(event: Orders.OrderPlaced): void;
}

// The retry topic carries the same message as the main one. One model is one
// message of the document, so both channels point at one entry under
// `components.messages` rather than at two copies of it.
@kafkaChannel(#{ topic: "orders.placed.retry", partitions: 3, replicas: 3 })
@channel("orders.placed.retry")
interface PlacedRetry {
  @send
  op retried(event: Orders.OrderPlaced): void;
}

@kafkaChannel(#{ topic: "orders.cancelled", partitions: 12, replicas: 3 })
@channel("orders.cancelled")
interface Cancelled {
  @send
  op cancelled(event: Orders.OrderCancelled): void;
}
