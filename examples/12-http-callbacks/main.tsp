// The HTTP bindings, on a webhook a payment provider calls back.
//
// HTTP is the one protocol here where a message can describe a response. The
// AsyncAPI HTTP binding puts `method` and `query` on the operation, and
// `headers` and `statusCode` on the message. `statusCode` only means anything
// on a message a reply names, which is why this example is a request and a
// reply rather than a single send.
//
// HTTP defines no server and no channel binding, so there is no
// `@httpServer` or `@httpChannel` to write.
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Payment Callbacks" })
@info(#{
  version: "1.0.0",
  description: "The webhook a payment provider calls when a charge settles.",
})
@server(
  "callbacks",
  #{
    host: "hooks.example.com",
    protocol: "https",
    title: "Callback endpoint",
    description: "The endpoint the provider posts to.",
  }
)
namespace PaymentCallbacks;

/**
 * The notification the provider posts when a charge reaches a final state.
 */
// `headers` is a Schema Object, and AsyncAPI requires it to be of type
// `object` with a `properties` key. A schema that is neither describes no
// header, so the emitter reports it and drops the field.
@httpMessage(#{
  headers: #{
    type: "object",
    properties: #{
      `X-Signature`: #{
        type: "string",
        description: "The HMAC the provider signs the body with.",
      },
      `X-Delivery-Id`: #{ type: "string", format: "uuid" },
    },
  },
})
@message
model ChargeSettled {
  /** The charge this notification is about. */
  chargeId: string;

  /** What the charge settled at, in the smallest unit of the currency. */
  amountMinor: int64;

  /** The ISO 4217 code of that currency. */
  currency: string;

  /** Whether the money moved. */
  succeeded: boolean;
}

/**
 * What this service answers the provider with.
 */
// `statusCode` is the field that makes this a reply rather than another
// event. AsyncAPI states it applies only to a message an Operation Reply
// Object names, and this emitter does not check that, because the rule spans
// two objects. It does check the range: 100 to 599, from RFC 9110.
@httpMessage(#{ statusCode: 202 })
@message
model CallbackAccepted {
  /** The delivery this acknowledges, echoed back for the provider's log. */
  deliveryId: string;
}

/**
 * The callback endpoint.
 */
@channel("/hooks/payments")
@useServer("callbacks")
interface PaymentHook {
  // `method` is one of the nine methods the binding lists. `query` follows
  // the same object-with-properties rule as `headers`.
  //
  // This is the compact form of request and reply: the parameter is the
  // message that arrives, and the return type is the answer. Both travel
  // over this one channel, which is what an HTTP callback does.
  @httpOperation(#{
    method: "POST",
    query: #{
      type: "object",
      properties: #{
        attempt: #{ type: "integer", description: "Which delivery attempt this is." },
      },
    },
  })
  @send("deliverChargeSettled")
  op deliver(event: ChargeSettled): CallbackAccepted;
}
