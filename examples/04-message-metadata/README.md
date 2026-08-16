# 04 — Message metadata

Everything that sits around a payload: headers, media type, correlation,
examples, and the message key.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/04-message-metadata
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

## Two ways to declare headers

There are two, and a message uses one or the other.

### `@header` on a field

`@header` lifts one field out of the payload and into the message `headers`
schema. The payload no longer declares that field.

`InvoiceIssued` lifts `correlationId` and `traceId`. The emitted `headers` is
an inline object schema with those two properties.

The key in the headers schema is the field's wire name. That is the same name
the payload schema would have used, so `@encodedName` renames a header too.
`correlationId` reaches the document as `correlation-id`.

Lifting also changes the payload schema key. The payload of `InvoiceIssued`
is a narrowed version of the model, so it claims the key
`InvoiceIssuedPayload` rather than `InvoiceIssued`.

Only a top-level field of a `@message` model is lifted. A `@header` further
down the payload keeps its place, and the emitter reports it.

### `@headers` with a model

`@headers(SettlementHeaders)` replaces the whole `headers` schema with that
model. Use it when the headers nest. The emitted `headers` is a `$ref` to the
model's own `components.schemas` entry.

## The two conflicts the emitter reports

1. `@header` on a field, mixed with `@headers` on the same message. The
   emitter reports the pair and emits neither.
2. A `@header` field whose wire name is `content-type`, next to
   `@contentType` on the same message. The emitter reports that too.

Neither conflict appears in `main.tsp`. Both are listed here so you know what
the diagnostic means when you hit it.

## Media type

`@contentType` sets the media type of one message. Without it, the message
carries no `contentType` field, and the document-level `defaultContentType`
applies. That default comes from the `default-content-type` emitter option.

`InvoiceSettled` sets `application/cloudevents+json`, which differs from the
document default.

## Correlation

`@correlationId(location, description?)` takes a runtime expression. It names
where the correlation value sits at runtime, such as
`$message.header#/correlation-id`.

The emitter checks the shape of the expression only. It does not check that
the pointer names a field the headers or the payload schema declares.

## Examples

`@messageExample` is repeatable. Each application adds one example, and the
examples keep their source order. The second argument names the example and
gives it a summary.

Each example carries `headers`, or `payload`, or both. An example with
neither is reported.

`headers` in an example is a key/value map. Its keys are wire names, so they
are `correlation-id` and `x-trace-id` here, not the TypeSpec names.

## The message key

`@message("InvoiceIssuedV1")` overrides the key of the entry in
`components.messages`. Without the argument, the key is the model's own
declaration name.

The channel refers to the message by that same key. So the `messages` map of
`InvoicingEvents` holds `InvoiceIssuedV1`, not `InvoiceIssued`.

## Two operations on one channel

This is the first example with two operations on one channel. Each one
carries `@send`, so the document holds two entries in `operations`.

The two entries share one `channel` reference. They differ only in their
`messages` array. `sendInvoiceIssued` names `InvoiceIssuedV1`, and
`sendInvoiceSettled` names `InvoiceSettled`.

A message reference addresses the `messages` map of the channel. It uses the
message key, so the override from `@message("InvoiceIssuedV1")` shows up in
the operation too.

Both operations are `@send`, because this service issues and settles the
invoices. `@receive` would state the opposite direction, which would be
wrong here.

## Next

Read [05-channels-and-parameters](../05-channels-and-parameters/) for
addressing.
