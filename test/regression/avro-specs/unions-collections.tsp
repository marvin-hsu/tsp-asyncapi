// The shapes that carry an order inside them: a nested record, an array of
// records, a map, and the two orders a nullable union can take.
//
// Avro reads the default of a union against its first branch alone, so which
// branch leads is behaviour rather than formatting. An optional field leads
// with null; an optional field that carries a default leads with the type of
// that default. Both are written out here so a change to either is visible.
//
// The nested record is reached twice on purpose. Avro has no import, so the
// first reach writes the whole record and every later one writes its full
// name.

@Avro.avroNamespace("com.example.orders")
namespace Orders;

/** Where an order goes. */
model Address {
  line1: string;
  city: string;
  postcode: string;
}

/** One line of an order. */
model OrderLine {
  sku: string;
  quantity: int32;
}

/** An order left the checkout. */
@Avro.avroRecord
model OrderPlaced {
  id: string;

  /** What was ordered. */
  lines: OrderLine[];

  /** Where the order goes. */
  shipping: Address;

  /** Where the invoice goes, when it is not the shipping address. */
  billing?: Address;

  /** Whatever the checkout wanted to carry along. */
  metadata: Record<string>;

  /** What the carrier calls this shipment. */
  tracking?: string = "pending";

  /** How many times delivery was tried. */
  attempts?: int32 = 0;
}

/** The fulfilment of an order moved on. */
@Avro.avroRecord
model OrderFulfilmentChanged {
  id: string;

  /** Where the order is going, as it stood at this moment. */
  shipping: Address;

  /** What the courier reported, when it reported anything. */
  note?: string;
}
