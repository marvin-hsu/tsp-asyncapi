// Composition. Four ways to build one schema out of others, plus the raw
// escape hatch.
// Example 02 covers the basic shapes and the constraints on them.
import "../..";

using AsyncAPI;

@service(#{ title: "Fulfilment Service" })
@info(#{ version: "1.0.0", description: "How the schema layer composes schemas." })
namespace FulfilmentService;

// `model B extends A` emits `allOf`. The first branch is a `$ref` to the
// base. The second branch holds the properties the subtype adds.
// `@discriminator` names the property that tells the subtypes apart. The
// property must be defined on this model, and it must be required.
// Referencing the base pulls both subtypes into `components.schemas`.
@discriminator("kind")
model PaymentEvent {
  kind: string;
  occurredAt: utcDateTime;
}

model PaymentAuthorized extends PaymentEvent {
  kind: "authorized";
  authorizationCode: string;
}

model PaymentDeclined extends PaymentEvent {
  kind: "declined";
  reason?: string;
}

model Pickup {
  storeId: string;
  readyAt: utcDateTime;
}

model Delivery {
  street: string;
  carrier: string;
}

// A plain union emits `anyOf`, which means "at least one branch matches".
// `@oneOf` emits `oneOf` instead, which means "exactly one branch matches".
// Use it when the variants are mutually exclusive.
@oneOf
union Fulfilment {
  pickup: Pickup,
  delivery: Delivery,
}

// A template instantiation gets a name composed from the template name and
// its arguments. `@friendlyName` names it yourself, so `Page<OrderLine>`
// reaches `components.schemas` as `OrderLinePage`.
@friendlyName("{name}Page", T)
model Page<T> {
  items: T[];
  total: int32;
}

model OrderLine {
  sku: string;

  @minValue(1)
  quantity: int32;

  @minValue(0)
  unitPrice: int64;
}

// `@jsonSchemaExtension` writes one raw key/value pair into this model's own
// schema. Use it for a JSON Schema keyword this emitter has no decorator
// for. It is repeatable, and each application adds one pair.
@jsonSchemaExtension("unevaluatedProperties", false)
@jsonSchemaExtension("$comment", "This schema rejects every unknown property.")
model DeliveryNote {
  text: string;
}

/**
 * One order that reached fulfilment.
 */
@summary("Order fulfilled")
@message
model OrderFulfilled {
  @format("uuid")
  orderId: string;

  lines: Page<OrderLine>;
  fulfilment: Fulfilment;
  payment: PaymentEvent;
  note?: DeliveryNote;
  fulfilledAt: utcDateTime;
}

// `@send` marks the operation as a message this application sends. The
// operation then reaches the `operations` map, under its own name.
@channel("fulfilment.orders.fulfilled")
interface FulfilledOrders {
  @send
  op sendOrderFulfilled(event: OrderFulfilled): void;
}
