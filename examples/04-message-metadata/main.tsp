// Everything that sits around a payload.
// Two messages. The first lifts individual fields into `headers`. The second
// replaces the whole `headers` schema with a model of its own.
import "../..";

using AsyncAPI;

@service(#{ title: "Invoicing Service" })
@info(#{
  version: "1.0.0",
  description: "Message headers, content types, correlation and examples.",
})
namespace InvoicingService;

/**
 * One issued invoice.
 */
// `@message("InvoiceIssuedV1")` overrides the `components.messages` key.
// Without the argument the key is the model name, `InvoiceIssued`.
// `@contentType` sets the media type of this message alone. It overrides the
// document-level `defaultContentType` from the emitter options.
// `@correlationId` points at the value that ties related messages together.
// The argument is a runtime expression. The emitter checks the shape of the
// expression. It does not check that the pointer names a declared field.
// `@messageExample` is repeatable. Each application adds one example, and
// the examples keep their source order. Each example needs `headers`, or
// `payload`, or both.
@message("InvoiceIssuedV1")
@contentType("application/json")
@correlationId("$message.header#/correlation-id", "The id of the originating request.")
@messageExample(
  #{
    headers: #{ `correlation-id`: "c-1001", `x-trace-id`: "t-77" },
    payload: #{ invoiceId: "inv-1", amountDue: 4200 },
  },
  #{ name: "small-invoice", summary: "One line, paid in full." }
)
@messageExample(#{ payload: #{ invoiceId: "inv-2", amountDue: 0 } }, #{ name: "zero-invoice" })
model InvoiceIssued {
  // `@header` lifts this field out of the payload schema and into the
  // message `headers` schema. The payload no longer declares it.
  // `@encodedName` sets the wire name, and the headers schema uses that same
  // wire name as its key. So this field is `correlation-id` in `headers`.
  @header
  @encodedName("application/json", "correlation-id")
  @format("uuid")
  correlationId: string;

  @header
  @encodedName("application/json", "x-trace-id")
  traceId: string;

  /** The identifier of the invoice. */
  invoiceId: string;

  /** The amount still due, in the smallest currency unit. */
  amountDue: int64;
}

/**
 * The transport headers every settlement message carries.
 */
// A plain model. It is the whole `headers` schema of the message below.
model SettlementHeaders {
  /** The queue manager fields the broker sets. */
  mqmd: MqmdHeaders;

  /** The version of the settlement contract. */
  contractVersion: "1" | "2";
}

model MqmdHeaders {
  messageId: string;
  putDate: utcDateTime;
}

/**
 * One settled invoice.
 */
// `@headers` replaces the whole `headers` schema with the given model. Use
// it when the headers nest, as they do here.
// Do not mix `@headers` with a field-level `@header` on the same message.
// The emitter reports that pair, and it emits neither.
@message
@headers(SettlementHeaders)
@contentType("application/cloudevents+json")
model InvoiceSettled {
  invoiceId: string;
  settledAt: utcDateTime;
}

@channel("invoicing.events")
interface InvoicingEvents {
  issued(event: InvoiceIssued): void;
  settled(event: InvoiceSettled): void;
}
