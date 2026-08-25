---
"tsp-asyncapi": minor
"tsp-asyncapi-core": minor
"tsp-avro": minor
---

Generate Avro payloads from the `tsp-avro` decorators, behind a preview flag

`avro` is the second name the `preview-features` emitter option accepts, and it
now has a provider behind it. With `avro` on, a model that carries
``@Avro.`record` `` gets an Avro schema as its AsyncAPI payload. The payload is
written as an object rather than as text, because Avro is JSON and AsyncAPI
inlines a schema of a JSON based format.

**The feature needs `tsp-avro` installed.** That library holds the Avro walk,
and this emitter carries no copy of it. `tsp-avro` is declared as an optional
peer dependency, in the `0.1.x` range. It is loaded at run time, and only when
the feature is on, so a project that leaves the feature off never installs it
and never loads it. A load that fails reports `avro-library-missing`.

**`tsp-avro` is experimental.** It is pre-1.0, and its decorators, its output
and its diagnostics may change in any release. A project that turns this
feature on takes that on with it.

This emitter calls the walk that library already has, rather than reading its
decorator state and writing a second walk. So the `.avsc` files and the
document carry one schema, and neither side can drift from the other.

A construct Avro cannot carry is refused by the walk. A refusal on a model the
document names reports `avro-artifact-unavailable`, and the message quotes the
reason. Only the first reason is quoted, so a model with several problems shows
one of them here. Emitting the Avro files themselves reports every reason. A
refusal stops the emit, because a document written next to the error would
answer a request for Avro with ordinary JSON Schema.

`tsp-avro` gains an `./unstable` entry point with three exports:
`buildAvroRecordWithDiagnostics`, `renderAvroSchema`, and the `AvroSchema`
type. The collecting variant reports nothing into the program. Reporting would
show a user the codes of a library they never asked to emit, and a project that
runs both emitters would read every refusal twice.

One lint rule is new and is in `recommended`:
`avro-content-type-undeclared`. It runs only when the feature is on. It reports
a message whose `@contentType` names Avro while nothing gives it an Avro
payload. Two diagnostics are new: `avro-artifact-unavailable` and
`avro-library-missing`.

The change is additive. A project that sets no `preview-features` gets the same
bytes it got before.
