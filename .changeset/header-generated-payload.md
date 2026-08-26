---
"tsp-asyncapi-core": minor
"tsp-asyncapi": minor
---

Refuse a `@header` on a model that declares a Protobuf message or an Avro
record.

`@header` says a property travels beside the payload. Neither target language
has that idea: Protobuf gives every property of a message a field number, and
Avro gives every property of a record a field. So a property the payload does
not carry has nowhere to go and no way to be marked as absent.

Leaving it out of the generated schema is the other option, and it is worse.
`@typespec/protobuf` and the Avro emitter both write the whole model, and
neither reads an AsyncAPI decorator, so the document and the standalone file
would describe different shapes for one message without saying so.

The new `header-on-generated-payload` error names every marked property. It is
reported before any emitter runs, so it holds for a project that emits a
document, one that emits only schema files, and one that emits nothing.

Use `@headers` instead. A separate model holds the headers, the message model
holds the payload, and every writer of every file agrees about which fields
belong where.

This rejects a combination that compiled before. A `@Protobuf.message` model
with a `@header` field and no preview feature produced a JSON Schema payload
with the header lifted, which was correct on its own terms. It is an error
now, because the same source is wrong the moment either binary schema is
asked for.
