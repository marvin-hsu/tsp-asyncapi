// Kafka bindings at all four levels.
//
// Server, channel, operation, and message, plus one generic `@binding` beside
// a Kafka one. The generic decorator adds no `bindingVersion`, and only a
// whole-document snapshot shows the two side by side.

        @service(#{ title: "Order Events" })
        @kafkaServer(#{
          schemaRegistryUrl: "https://registry.example.com",
          schemaRegistryVendor: "confluent"
        })
        @server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        namespace Orders;

        @message
        @kafkaMessage(#{
          key: #{ type: "string" },
          schemaIdLocation: "header",
          schemaIdPayloadEncoding: "confluent",
          schemaLookupStrategy: "TopicIdStrategy"
        })
        @binding("mqtt", #{ qos: 1 })
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        @kafkaChannel(#{
          topic: "orders.created",
          partitions: 3,
          replicas: 3,
          topicConfiguration: #{ `cleanup.policy`: #["compact"], `retention.ms`: 604800000 }
        })
        @binding("amqp", #{ expiration: 100 })
        interface OrderChannel {
          @send
          @kafkaOperation(#{ groupId: #{ type: "string" }, clientId: #{ type: "string" } })
          op publish(event: OrderCreated): void;
        }
      