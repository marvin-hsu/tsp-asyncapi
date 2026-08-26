# Changelog

## 0.3.0

### Minor Changes

- a7c6211: Keep a lifted `@header` out of a generated Protobuf or Avro payload.

  A property marked with `@header` travels beside the payload, and the document
  already leaves it out of a JSON Schema payload. A generated payload described
  it as well, so one field was described twice and nothing said so.

  A header whose type has no Protobuf form no longer refuses the whole payload.
  A header is not a proto field, so its type has nothing to say about a payload
  it is not in.

  Two new diagnostics come with this. `header-with-protobuf-field` is an error
  on a property that carries both `@header` and `@Protobuf.field`, because the
  field number then names a place the payload has no room for.
  `avro-record-keeps-header` is a warning that names the fields the `.avsc` file
  still declares, because Avro has no notion of a message header.

  The new `protobuf-field-on-header` lint rule reports the same combination as a
  warning, and it is in `recommended`. It runs whether or not the preview
  feature is on, because the `.proto` file and the lifted header do not depend
  on it.

## 0.2.0

### Minor Changes

- 746fd94: Generate Avro payloads from the `tsp-avro` decorators, behind a preview flag

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

- 2d01651: Generate proto3 payloads from the official Protobuf decorators, behind a preview flag

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

- 8e262e9: Share reusable fragments through `components`

  `components` now carries eleven of its nineteen sections. A fragment the
  author named is written there on its first use: a tag, a channel parameter,
  a server variable, and a user-declared scalar. A fragment with no name of
  its own is written there when a second place carries the same one: a
  Bindings Object, a Correlation ID Object, an External Documentation Object,
  and a raw payload or headers schema.

  Two changes are visible to a TypeScript consumer of the document types. A
  field that can now hold a reference has `| ReferenceObject` in its type, and
  `ComponentsObject.schemas` accepts a Multi Format Schema Object. Code that
  reads `components.schemas.X.properties` no longer compiles without narrowing
  first.

  The emitted document changes shape for any program that repeats a fragment,
  or that declares a tag, a channel parameter, a server variable, or a scalar.
  Every emitted document still passes the official AsyncAPI parser.

  `declarationNameFor` accepts a `Scalar`, and `sanitizeDeclarationName` is
  now exported.

  A new diagnostic, `raw-schema-key-taken`, reports a model that wants the
  `components.schemas` key a shared raw schema took.

## 0.1.1

Exports `PACKAGE_NAME`. It was defined here and used by the test host, and both
the README and the 0.1.0 entry described it, but `index.ts` never exported it.
Anything outside this package that followed the documentation got `undefined`.

Nothing else changes. `LIBRARY_NAME` still holds the name this library
registers with the compiler, which is `tsp-asyncapi`; `PACKAGE_NAME` holds this
package's own name.

## 0.1.0

First release. This package is the decorator half of `tsp-asyncapi`, separated
out so that more than one emitter can share one input language.

It versions independently of any emitter. `tsp-asyncapi` depends on it with a
`~` range, so a minor release here does not reach an emitter until that emitter
takes it. The two started at different numbers for that reason: this package is
new, and `0.1.0` says so.

What it exports:

- The 56 decorators, declared in `lib/main.tsp` and implemented here.
- A reader for each kind of decorator state: 24 functions and 51 types.
- `$lib` with all 103 diagnostics, `reportDiagnostic`, `createDiagnostic`,
  `LIBRARY_NAME`, and `PACKAGE_NAME`.
- Spec-derived constants, and the naming and serialization helpers an emitter
  needs.
- The document object types an author writes directly, under `./types`. That
  covers every protocol binding object, security schemes, tags, and examples.
- The semantic model, under `./unstable`. Its shape is expected to change, and
  the entry point name is the warning.
- A test host, under `./testing`, that loads the decorators alone.

Two notes on the boundary:

- `LIBRARY_NAME` is `tsp-asyncapi`, not this package's name. It is the prefix of
  every diagnostic code, and those codes were not renamed when the emitter was
  split in two.
- Everything in the main entry point is a semver promise, including the
  constants and the helpers. Only `./unstable` is exempt.
