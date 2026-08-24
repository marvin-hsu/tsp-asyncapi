// The boundary between a fragment that is shared and one that is not.
//
// Every kind this emitter promotes appears twice in this document: once in a
// form that earns a `components` entry, and once in a form that stays where
// it is. A change to the promotion rule moves exactly one of each pair, so
// the diff says which rule moved.
//
// - `correlationId`: `Placed` and `Shipped` state one location, `Audited`
//   states another. Two uses share, one use does not.
// - `externalDocs`: the same link on two channels, and a third link on one.
// - `bindings`: one `@kafkaChannel` on `OrderChannel` reaches both its
//   channels; `AuditChannel` carries its own.
// - `tags`: every tag is shared, because a tag carries the name its author
//   wrote. `edge` appears twice with one meaning; `local` appears once.

        @service(#{ title: "Order Events" })
        @asyncTag("edge")
        namespace Orders;

        @message
        @correlationId("$message.header#/correlation-id")
        @asyncTag("edge")
        model Placed {
          id: string;
        }

        @message
        @correlationId("$message.header#/correlation-id")
        model Shipped {
          id: string;
        }

        @message
        @correlationId("$message.header#/audit-id")
        @asyncTag("local")
        model Audited {
          id: string;
        }

        @channel("orders.placed")
        @externalDocs("https://example.com/orders", "The order guide.")
        @kafkaChannel(#{ topic: "orders" })
        interface OrderChannel {
          @send
          op place(event: Placed): void;
        }

        @channel("orders.shipped")
        @externalDocs("https://example.com/orders", "The order guide.")
        @kafkaChannel(#{ topic: "orders" })
        interface ShippingChannel {
          @send
          op ship(event: Shipped): void;
        }

        @channel("orders.audited")
        @externalDocs("https://example.com/audit")
        @kafkaChannel(#{ topic: "audit" })
        interface AuditChannel {
          @send
          op audit(event: Audited): void;
        }
