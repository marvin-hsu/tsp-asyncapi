---
"tsp-asyncapi-core": minor
"tsp-asyncapi": minor
---

Keep a lifted `@header` out of a generated Protobuf or Avro payload.

A property marked with `@header` travels beside the payload, and the document
already leaves it out of a JSON Schema payload. A generated payload described
it as well, so one field was described twice and nothing said so.

A header whose type has no Protobuf form no longer refuses the whole payload.
A header is not a proto field, so its type has nothing to say about a payload
it is not in.

`header-with-protobuf-field` is a new error on a property that carries both
`@header` and `@Protobuf.field`, because the field number then names a place
the payload has no room for.

The new `protobuf-header-on-message` lint rule is in `recommended`. It reports
a `@header` property of a `@Protobuf.message` model, which fails whether or
not the property carries a field number: with one, the number names a place
the payload leaves empty, and without one the official emitter refuses the
`.proto` file. The rule runs whether or not the preview feature is on, and it
stays quiet where the error above already reports.
