// One order domain, written once and emitted as Avro schema files.
//
// `tsp-avro` is a library and an emitter of its own. It writes `.avsc` files
// and nothing else, so this example imports it alone: there is no AsyncAPI
// document here, and no `@service`.
//
// Two models carry `@Avro.record`, so the emitter writes two files. Both
// reach `Address` and `Timestamp`, and both hold a whole copy of each. Avro
// has no import, so a schema file stands alone or it is unusable.
//
// A `/** */` comment becomes the `doc` of what it sits on. A `//` comment,
// like this one, is not emitted, so the explanations below stay out of the
// schemas.
import "tsp-avro";

// `namespace` and `record` are reserved words in TypeSpec, so both decorator
// names are written in backticks. The upstream Protobuf library writes
// ``@Protobuf.`package``` for the same reason.
//
// The Avro namespace becomes the directory a file is written into, and it
// qualifies every name inside. So the two files land under
// `schemas/com/example/orders/`.
@Avro.`namespace`("com.example.orders")
namespace Orders;

// The logical type sits on the scalar, so every field of this type carries
// it. A reader that knows `timestamp-millis` builds a timestamp. A reader
// that does not know it reads the `long`, which is what is on the wire.
/** A moment in time, as the milliseconds since the Unix epoch. */
@Avro.logicalType("timestamp-millis")
scalar Timestamp extends int64;

/** Where an order goes. */
model Address {
  /** The street and the number. */
  line1: string;

  /** The flat, the floor, or whatever else the courier needs. */
  line2?: string;

  city: string;

  /** The postcode, as the destination country writes it. */
  postcode: string;

  /** The ISO 3166-1 alpha-2 code of the country. */
  country: string;
}

// `@enumDefault` names the symbol a reader falls back to. A reader written
// against this schema meets a symbol added later and reads `Unknown`, rather
// than failing on a value it has never seen.
/** How far an order has got. */
@Avro.enumDefault("Unknown")
enum FulfilmentStatus {
  Unknown,
  Placed,
  Packed,
  Shipped,
  Delivered,
}

/** One line of an order. */
model OrderLine {
  /** The stock keeping unit that was ordered. */
  sku: string;

  quantity: int32;

  // A decimal carries its digits as bytes. The precision counts the digits,
  // and the scale says how many of them sit after the point.
  /** The price of one unit, in the currency of the order. */
  @Avro.decimal(12, 2)
  unitPrice: bytes;
}

/** An order left the checkout. */
@Avro.`record`
model OrderPlaced {
  // `uuid` is written on a string, so what is on the wire is the text of the
  // UUID.
  /** The identifier of the order. */
  @Avro.logicalType("uuid")
  id: string;

  /** When the customer placed the order. */
  placedAt: Timestamp;

  // An array of records holds the whole record at its item type.
  /** What was ordered. */
  lines: OrderLine[];

  /** Where the order goes. */
  shipping: Address;

  // An optional field is a union with null, and its default is null. Avro
  // reads a default against the first branch of a union alone, so null leads.
  // `Address` is already written above, so the branch here is its full name.
  /** Where the invoice goes, when it is not the shipping address. */
  billing?: Address;

  // A `Record<T>` becomes an Avro map. Avro keys a map with strings, so only
  // the value type is written.
  /** Whatever the checkout wanted to carry along. */
  metadata: Record<string>;
}

/** The fulfilment of an order moved on. */
@Avro.`record`
model OrderFulfilmentChanged {
  // `@aliases` names what a field used to be called. A reader written against
  // this schema still reads data written under the old name.
  /** The identifier of the order. */
  @Avro.aliases("orderNumber")
  @Avro.logicalType("uuid")
  id: string;

  /** When the fulfilment moved on. */
  changedAt: Timestamp;

  /** How far the order has got. */
  status: FulfilmentStatus;

  /** Where the order is going, as it stood at this moment. */
  shipping: Address;

  // The author wrote a default that is not null, so the string leads the
  // union and null follows it. That is the same Avro rule as above, read the
  // other way round.
  /** What the carrier calls this shipment. */
  trackingNumber?: string = "pending";
}
