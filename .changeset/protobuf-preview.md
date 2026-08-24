---
"tsp-asyncapi": minor
"tsp-asyncapi-core": minor
---

Build a message payload from the official Protobuf decorators

A new emitter option, `preview-features`, turns on a feature this release
names but does not promise to keep. Its reserved names are `protobuf` and
`avro`. It defaults to the empty list, so every existing document is
unchanged.

With `preview-features: ["protobuf"]`, a model that carries the official
`TypeSpec.Protobuf` decorators gets the proto3 text of its whole package as
its AsyncAPI payload. The emitter runs `@typespec/protobuf` in memory and
keeps the text, so the document and a `.proto` file written by that emitter
say the same thing. Two messages of one package share one
`components.schemas` entry.

`avro` is reserved and has no provider yet. Asking for it reports
`preview-feature-unavailable` and writes no file.

Four diagnostics are new: `preview-feature-unavailable`,
`protobuf-artifact-unavailable`, `conflicting-message-schema-source`, and
`conflicting-generated-schema-source`.

Both additions are additive. `AsyncAPIEmitterOptions` gains the optional
`preview-features` field, and the new public type `PreviewFeature` names its
values. `tsp-asyncapi-core` gains `ExternalSchemaArtifact`,
`SchemaArtifactIndex`, and `emptySchemaArtifacts`, and `resolveService` takes
an optional fourth argument. Existing calls keep compiling.
