// Message headers, correlationId, contentType, and examples.
//
// Both header mechanisms in one document. `OrderPlaced` lifts flat fields out
// of its payload, so it also pins the split payload component. `OrderShipped`
// names a headers model instead.

        @service(#{ title: "Order Events" })
        namespace Orders;

        model MqmdFields {
          CorrelId: string;
        }

        model ShippingHeaders {
          MQMD: MqmdFields;
        }

        @message
        @contentType("application/json")
        @correlationId("$message.header#/correlationId", "Ties a reply to its request.")
        @messageExample(
          #{
            headers: #{ correlationId: "abc-123" },
            payload: #{ id: "o-1", amount: 12.5 }
          },
          #{ name: "smallOrder", summary: "One line, already paid." }
        )
        @messageExample(
          #{ payload: #{ id: "o-2", amount: 999.0 } },
          #{ name: "largeOrder" }
        )
        @asyncTag("orders", #{ description: "Emitted by the order service." })
        @externalDocs("https://example.com/order-placed", "How to consume this message.")
        model OrderPlaced {
          @header
          correlationId: string;

          @header
          @encodedName("application/json", "x-retry-count")
          retryCount?: int32;

          id: string;
          amount: float64;
        }

        @message("shipped")
        @headers(ShippingHeaders)
        @correlationId("$message.header#/MQMD/CorrelId")
        model OrderShipped {
          id: string;
        }
      