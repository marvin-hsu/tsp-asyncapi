// Channels, parameters, and the three operation shapes.
//
// One channel with address expressions and two servers, one dynamic channel,
// and the three ways an operation reaches the document: send, receive, and a
// send with an explicit reply channel and reply address.

        @service(#{ title: "Order Events" })
        @securityScheme("kafka-scram", #{ type: "scramSha512" })
        @server("primary", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        @server("secondary", #{ host: "kafka.dr.example.com:9092", protocol: "kafka" })
        namespace Orders;

        @message
        model CreateOrder {
          id: string;
        }

        @message
        model OrderAccepted {
          id: string;
        }

        @message
        model OrderShipped {
          id: string;
        }

        @dynamicChannel
        @doc("The reply channel. Its address is only known at run time.")
        interface ReplyChannel {
          @receive op onAccepted(): OrderAccepted;
        }

        @channel("orders.{region}.{tenant}.create")
        @useServer("primary")
        @useServer("secondary")
        @asyncTag("commands")
        interface OrderCommands {
          @send
          @useSecurity("kafka-scram")
          @replyChannel(ReplyChannel)
          @replyAddress("$message.header#/replyTo", "Where the reply goes.")
          op createOrder(
            @parameterLocation("$message.header#/region")
            @doc("The region of the cluster.")
            region: string,

            tenant: "acme" | "globex",

            command: CreateOrder
          ): OrderAccepted;
        }

        @channel("orders.shipped", "shipped")
        namespace OrderEvents {
          @receive
          @doc("Consumes the shipment event.")
          op onOrderShipped(): OrderShipped;
        }
      