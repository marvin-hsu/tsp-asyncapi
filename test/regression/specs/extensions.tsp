// `x-` extensions on info, a channel, an operation, and a message.
//
// All four objects that carry extensions, in one document. The snapshot pins
// where an `x-` field sits: after every specification field of its object, and
// in the order the applications were written.

        @service(#{ title: "Order Events" })
        @info(#{ version: "1.4.2", description: "Every order event." })
        @extension("x-owner", #{ team: "orders", contact: #{ slack: "#orders" } })
        @extension("x-audience", #["internal", "partner"])
        namespace Orders;

        @message
        @doc("One order a customer placed.")
        @extension("x-schema-id", 4711)
        model OrderCreated {
          orderId: string;
        }

        @channel("orders.created")
        @doc("Every order lands here.")
        @extension("x-retention", #{ days: 7, compacted: true })
        interface OrderChannel {
          @send
          @summary("Publish an order")
          @extension("x-sla-ms", 250)
          @extension("x-replaced-by", "publishV2")
          op publish(event: OrderCreated): void;
        }
      