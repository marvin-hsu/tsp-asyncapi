---
"tsp-asyncapi": minor
"tsp-asyncapi-core": minor
---

Generate proto3 payloads from the official Protobuf decorators, behind a preview flag

A new emitter option, `preview-features`, turns on a feature that changes the
emitted document. It takes an array of reserved names. Two names are reserved:
`protobuf` and `avro`. This entry covers `protobuf`, and `avro` has an entry of
its own. A request for a reserved name with nothing behind it reports
`preview-feature-unavailable`, and no file is written.

With `protobuf` on, a model that carries the official `TypeSpec.Protobuf`
decorators gets proto3 text as its AsyncAPI payload. This emitter reads the
decorator state and renders the text itself. It never calls the official
emitter and never reads a `.proto` file. So the runtime dependencies of this
package do not change. `@typespec/protobuf` is declared as an optional peer
dependency, in the `0.85.x` range, to state the range whose state this release
reads.

A construct proto3 cannot carry is refused rather than translated. An external
reference, a template instance, a union, and a scalar with no proto3 type are
each reported. A refusal stops the emit, because a document written next to the
error would ignore the request without saying so.

`tsp-asyncapi` exports one new type, `PreviewFeature`. `tsp-asyncapi-core`
exports `SchemaArtifactIndex`, `ExternalSchemaArtifact`, and
`emptySchemaArtifacts`. They name the schemas a provider generated, as the
resolve stage receives them.

Four diagnostics are new: `preview-feature-unavailable`,
`protobuf-artifact-unavailable`, `conflicting-generated-schema-source`, and
`conflicting-message-schema-source`.

The change is additive. A project that sets no `preview-features` gets the same
bytes it got before.
