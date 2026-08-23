// Request and reply. Three operations, and the two shapes of an AsyncAPI
// `reply` object.
//
// THE SIGNATURE RULE. Read this before anything else in the file.
// For `@send` the parameters are the messages sent. The return type is the
// messages of the reply.
// For `@receive` the parameters are the messages of the reply. The return
// type is the messages received.
// So the two decorators read the same signature in opposite directions.
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Order Desk" })
@info(#{
  version: "1.0.0",
  description: "The request and reply patterns this emitter supports.",
})
namespace OrderDesk;

/**
 * A question about the state of one order.
 */
@message
model OrderStatusQuery {
  @format("uuid")
  orderId: string;
}

/**
 * The answer to one status query.
 */
@message
model OrderStatus {
  @format("uuid")
  orderId: string;

  state: "pending" | "shipped" | "cancelled";
}

/**
 * A command that asks for one new order.
 */
@message
@correlationId("$message.header#/correlation-id", "The id of the originating request.")
model CreateOrder {
  /** Ties the reply back to this command. */
  @header
  @encodedName("application/json", "correlation-id")
  @format("uuid")
  correlationId: string;

  sku: string;

  @minValue(1)
  quantity: int32;
}

/**
 * The acknowledgement of one accepted order.
 */
@message
@correlationId("$message.header#/correlation-id", "The id of the originating request.")
model OrderAccepted {
  /** Carries the value the command set. */
  @header
  @encodedName("application/json", "correlation-id")
  @format("uuid")
  correlationId: string;

  @format("uuid")
  orderId: string;
}

/**
 * Status queries and their answers, on one channel.
 */
// The implicit reply. This operation carries no reply decorator at all.
// Both sides of the signature name a message of this same channel. The
// parameter names `OrderStatusQuery`, which is the message sent. The return
// type names `OrderStatus`, which is the message of the reply. The emitter
// reads that as request and reply over one channel, and it writes a `reply`
// object.
// This is the cheapest form of the pattern. Use it when the answer travels
// back over the channel the question went out on.
@channel("orders.status")
interface OrderStatusDesk {
  @send
  op getOrderStatus(query: OrderStatusQuery): OrderStatus;
}

/**
 * The replies to order commands, on a channel the broker names at runtime.
 */
// `@dynamicChannel` emits `address: null`. AsyncAPI reads that as "unknown".
// Its only argument is the channel id, and not an address. It overrides the
// key in the emitted `channels` map. So the key here is `order-replies`, and
// not the declaration name `OrderReplies`.
// This channel must be dynamic, because `createOrder` below carries a
// `@replyAddress`. See the comment on that operation for the rule.
// The operation here is `@receive`, in its inverted form. The return type is
// the message received, and the operation takes no parameter.
@dynamicChannel("order-replies")
interface OrderReplies {
  @receive
  op onOrderAccepted(): OrderAccepted;
}

/**
 * The commands that create an order.
 */
// The explicit reply channel. `@replyChannel` names the channel the reply
// travels over. The argument is the interface or the namespace that carries
// the channel, and not the id string of that channel. The compiler resolves
// the reference, so a typo cannot reach the document.
// The named channel needs no operation of its own for the reply to work. The
// emitter puts the reply message on that channel. `OrderReplies` declares one
// anyway, to show the inverted `@receive` signature.
//
// `@replyAddress` names where the address of the reply sits at runtime. It
// depends on the reply channel being dynamic. AsyncAPI requires the address
// of the reply channel to be null when a reply address is given. That null
// address is what `@dynamicChannel` produces. Put `@replyAddress` on an
// operation whose reply channel carries an address, and the emitter reports
// `reply-address-needs-dynamic-channel`. It then drops the address and keeps
// the rest of the reply.
//
// The action is `@send`, so the parameter is the message sent and the return
// type names the message of the reply.
@channel("orders.create")
interface OrderCommands {
  @send
  @replyChannel(OrderReplies)
  @replyAddress("$message.header#/replyTo", "The reply topic.")
  op createOrder(command: CreateOrder): OrderAccepted;
}
