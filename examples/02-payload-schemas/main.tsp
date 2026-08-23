// The basic shapes of the schema layer, and the constraints on them.
// Composition is a separate topic. Example 03 covers inheritance, unions,
// templates and the extension escape hatch.
//
// Every model below is reachable from the payload of the single message at
// the bottom of the file. Only a model that a message payload reaches gets a
// `components.schemas` entry, so an unreferenced model would not appear.
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Catalog Service" })
@info(#{ version: "1.0.0", description: "The basic shapes of the schema layer." })
namespace CatalogService;

// A user scalar carries its documentation and its constraints to every use
// site. `@doc` becomes `description` and `@maxLength` becomes `maxLength`.
// A user scalar gets no `components.schemas` entry of its own. The emitter
// writes its shape into every property that uses it.
@doc("An RFC 5321 mailbox address.")
@maxLength(254)
scalar Email extends string;

// An enum does get its own entry. An enum whose members carry no explicit
// value emits the member names. The schema is `type: string` with an `enum`
// array.
enum Currency {
  USD,
  EUR,
  JPY,
}

// An enum whose members all carry numbers emits `type: number` instead.
enum Priority {
  Low: 0,
  Normal: 5,
  High: 10,
}

// `@minValue` becomes `minimum`. `@maxValueExclusive` becomes
// `exclusiveMaximum`.
// `@example` becomes one entry of the `examples` array. The value is
// serialized to plain JSON.
@summary("An amount of money")
@doc("An amount in the smallest unit the currency defines.")
@example(#{ amount: 1250, currency: Currency.EUR })
model Money {
  @minValue(0)
  @maxValueExclusive(1000000000)
  amount: int64;

  currency: Currency;
}

// `@encodedName` sets the key the schema uses. The TypeSpec name stays
// `postalCode`, and the emitted property key is `postal_code`.
model PostalAddress {
  @minLength(1)
  @maxLength(80)
  street: string;

  @minLength(1)
  city: string;

  @encodedName("application/json", "postal_code")
  @pattern("^[0-9]{4,10}$")
  postalCode: string;

  @pattern("^[A-Z]{2}$")
  country: string;
}

// A nested model becomes a `$ref` from the property that holds it. An
// optional property stays out of `required`. An array becomes
// `type: array`, and `@minItems` and `@maxItems` sit next to it.
model Customer {
  @format("uuid")
  id: string;

  email: Email;
  billingAddress: PostalAddress;

  // Optional. It stays out of the `required` array.
  shippingAddress?: PostalAddress;

  @minItems(1)
  @maxItems(20)
  tags: string[];

  // A union of string literals collapses to a single `enum`.
  status: "active" | "suspended" | "closed";

  // A union with a `null` branch emits `anyOf`. Draft-07 JSON Schema has no
  // `nullable` keyword.
  nickname: string | null;

  // A map becomes `type: object` with `additionalProperties`.
  attributes: Record<string>;
}

/**
 * One placed order.
 */
@summary("Order placed")
@message
model OrderPlaced {
  @format("uuid")
  orderId: string;

  customer: Customer;
  total: Money;
  priority: Priority;
  placedAt: utcDateTime;
}

// `@send` marks the operation as a message this application sends. The
// operation then reaches the `operations` map, under its own name.
@channel("catalog.orders.placed")
interface PlacedOrders {
  @send
  op sendOrderPlaced(event: OrderPlaced): void;
}
