// The `x-` fields AsyncAPI leaves to the author.
// A specification extension carries what the specification has no field for:
// an owning team, a retention window, a service level. `@extension` writes
// one, and it reaches four objects: `info`, a channel, an operation, and a
// message.
import "../..";

using AsyncAPI;

// On the service namespace the extension lands in `info`.
// The decorator is repeatable, so one target can carry several keys. The
// emitted keys follow source order, and they sit after every field the
// specification defines.
@service(#{ title: "Orders Service" })
@info(#{ version: "1.0.0", description: "Order events, with the metadata our tooling reads." })
@extension("x-owner", "orders-team")
@extension("x-repository", "https://github.com/example/orders")
// A value is any JSON value, so an object and an array both work.
@extension(
  "x-review",
  #{ board: "architecture", cadence: "quarterly", reviewers: #["ana", "bo"] }
)
namespace OrdersService;

/**
 * One order that a customer placed.
 */
// On a `@message` model the extension lands in that message object.
// For a keyword inside the payload schema, use `@jsonSchemaExtension`
// instead. The two decorators do not overlap: this one writes a field of the
// AsyncAPI object, and that one writes a keyword of the JSON Schema.
@message
@extension("x-schema-registry-id", 4711)
model OrderPlaced {
  orderId: string;
  amount: float64;
}

// On the interface that carries `@channel` the extension lands in that
// channel object.
@channel("orders.placed")
@extension("x-retention-hours", 168)
@extension("x-partitions", 12)
interface OrderChannel {
  /**
   * Publishes one placed order.
   */
  // On an operation the extension lands in that operation object.
  @send
  @extension("x-sla-ms", 250)
  op publishOrderPlaced(event: OrderPlaced): void;
}

// A server and a security scheme take no extension. Both are declared with a
// named argument on the namespace, so one `@extension` cannot name which of
// them it means.
