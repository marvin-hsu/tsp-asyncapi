// The raw payload and raw headers of a message.
//
// A Multi Format Schema Object is written into the message, never into
// `components`. That makes it the one message shape the other programs cannot
// reach.

        @service(#{ title: "Order Events" })
        namespace Orders;

        @message
        @rawPayload("application/vnd.apache.avro;version=1.9.0", #{
          type: "record",
          name: "OrderCreated",
          fields: #[#{ name: "orderId", type: "string" }]
        })
        @rawHeaders("application/vnd.apache.avro;version=1.9.0", #{
          type: "record",
          name: "OrderCreatedHeaders",
          fields: #[#{ name: "correlationId", type: "string" }]
        })
        model OrderCreated {}
      