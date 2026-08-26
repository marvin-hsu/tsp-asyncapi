---
"tsp-asyncapi-core": minor
"tsp-asyncapi": minor
---

Remove the headers slot from `SchemaArtifactIndex`.

The type promised two slots and only one was ever filled. Nothing read the
other one, so a provider that filled it changed no document. It was a
promise with no consumer.

Headers will not be filled later either. A header travels as its own key and
value, so no transport carries the headers object as one encoded block. Avro
could not name most of them in any case: a legal Avro name matches
`[A-Za-z_][A-Za-z0-9_]*`, and a header is usually written `x-correlation-id`.

`SchemaArtifactIndex` now carries `payloadFor` alone, and
`conflicting-generated-schema-source` no longer names a slot. Headers are
lowered from their TypeSpec model, whatever the payload is written in.
