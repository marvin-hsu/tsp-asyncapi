// Four brokers that all describe the same idea: a named destination, and
// whether it is a queue or something that fans out.
//
// AMQP calls it an exchange or a routing key. JMS and Anypoint MQ call it a
// destination. IBM MQ calls it a queue or a topic. The words differ, the
// fields differ, and the allowed values differ, which is why each protocol
// gets its own decorator rather than one shared "destination" decorator.
//
// One order-dispatch service, published to all four.
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Order Dispatch" })
@info(#{
  version: "1.0.0",
  description: "Order dispatch, published to four enterprise brokers.",
})
@server(
  "rabbit",
  #{ host: "rabbit.example.com:5672", protocol: "amqp", title: "RabbitMQ" }
)
@server(
  "activemq",
  #{ host: "activemq.example.com:61616", protocol: "jms", title: "ActiveMQ" }
)
@server(
  "ibm-mq",
  #{ host: "mq.example.com:1414", protocol: "ibmmq", title: "IBM MQ queue manager" }
)
@server(
  "anypoint",
  #{ host: "mq-eu.anypoint.mulesoft.com", protocol: "amqp", title: "Anypoint MQ" }
)
// Two server bindings, and both reach all four servers. `@server` is
// repeatable and keyed by name, so no decorator target can single one out.
//
// `jmsConnectionFactory` is required. Leave it out and the emitter reports
// `missing-binding-field` and drops the whole JMS binding, because AsyncAPI
// would reject the document it would otherwise write.
@jmsServer(#{
  jmsConnectionFactory: "org.apache.activemq.ActiveMQConnectionFactory",
  clientID: "order-dispatch",
})
// `heartBeatInterval` is checked against the range IBM MQ states: 0 to
// 999999 seconds. A value outside it is reported and dropped, and the rest of
// the binding is kept.
@ibmMqServer(#{
  groupId: "PRODCLSTR1",
  ccdtQueueManagerName: "*",
  heartBeatInterval: 300,
})
namespace OrderDispatch;

/**
 * An order handed to fulfilment.
 */
// Three message bindings on one message. Each names the field its own
// protocol defines for the same idea, and none of them agrees with another.
//
// AMQP describes the payload encoding and an application-defined type. JMS
// and Anypoint MQ each describe headers, and both take a Schema Object.
//
// IBM MQ is the odd one twice over. Its `headers` is a comma-separated list
// of header names, not a Schema Object, so it cannot share a check with the
// other two. And IBM MQ allows the field only on a binary payload: write
// `type: "jms"` beside it and the emitter reports `invalid-binding-field`
// and drops the headers, because the AsyncAPI parser rejects that pair.
@amqpMessage(#{ contentEncoding: "gzip", messageType: "order.dispatched" })
@jmsMessage(#{
  headers: #{
    type: "object",
    properties: #{ JMSXGroupID: #{ type: "string" } },
  },
})
@anypointMqMessage(#{
  headers: #{
    type: "object",
    properties: #{ correlationId: #{ type: "string", format: "uuid" } },
  },
})
@ibmMqMessage(#{
  type: "binary",
  headers: "Content-Type,X-Correlation-Id",
  description: "The dispatch record, as a length-prefixed binary frame.",
  expiry: 60000,
})
@message
model OrderDispatched {
  /** The order that was dispatched. */
  orderId: string;

  /** The warehouse it left from. */
  warehouseId: string;

  /** The carrier's tracking number. */
  trackingNumber: string;
}

/**
 * The destination every dispatch is written to.
 */
// Four channel bindings, one destination.
//
// `is` is a TypeSpec keyword, so the AMQP field is written in backticks. The
// emitted member is still `is`. Its two values are `queue` and `routingKey`,
// and it says which of `exchange` and `queue` describes the channel. AsyncAPI
// does not require the two to agree, and this emitter does not check it.
//
// A name of an exchange or a queue is at most 255 characters, which the
// emitter checks.
@amqpChannel(#{
  `is`: "routingKey",
  exchange: #{ name: "dispatch", type: "topic", durable: true, vhost: "/" },
})
// JMS allows `queue` and `fifo-queue`. Anypoint MQ allows those two and
// `exchange` as well. Writing `exchange` here would be reported, which is why
// the two sets are checked apart rather than shared.
@jmsChannel(#{ destination: "ORDER.DISPATCH", destinationType: "queue" })
@anypointMqChannel(#{ destination: "order-dispatch", destinationType: "exchange" })
// IBM MQ pairs `destinationType` with one of `queue` and `topic`. AsyncAPI
// says `queue` applies only when the type is `queue`, and this emitter does
// not check that pairing, the same way it leaves the AMQP one alone.
//
// `maxMsgLength` is checked against 0 to 104857600 bytes, which is 100 MB.
@ibmMqChannel(#{
  destinationType: "queue",
  queue: #{ objectName: "ORDER.DISPATCH", isPartitioned: false, exclusive: false },
  maxMsgLength: 4194304,
})
@channel("order.dispatch")
interface DispatchDestination {
  // `deliveryMode` is 1 for transient and 2 for persistent, and nothing else.
  // `expiration` is a number of milliseconds, so it is never negative.
  //
  // The emitted field order follows the specification rather than the order
  // written here, so two documents describing one operation cannot differ by
  // how their author typed the literal.
  @amqpOperation(#{
    deliveryMode: 2,
    expiration: 86400000,
    mandatory: true,
    cc: #["order.audit"],
    timestamp: true,
  })
  @send("publishOrderDispatched")
  op publish(event: OrderDispatched): void;
}
