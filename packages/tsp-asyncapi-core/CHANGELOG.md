# Changelog

## 0.4.1

### Patch Changes

- Show decorator documentation on hover in the TypeSpec editor.

  The language service reads `/** */` on declarations in `lib/main.tsp`. It
  ignores TypeScript JSDoc, and it ignores `//` comments next to `extern dec`.
  Every decorator now has a doc comment, with `@param` on each argument, so
  hovering `@server` or `@avroRecord` shows what the decorator takes.

  Comments in the TypeScript sources follow the same short-sentence style.
  Behaviour is unchanged.

## 0.4.0

### Minor Changes

- 00dc835: Check what `@info` carries, and check the server name `@useServer` names.

  `@info` checked nothing. `termsOfService`, `contact.url` and `license.url`
  each carry the `uri` format, and the official parser rejects the whole
  document over a value that is not an absolute URL. A blank `version` was
  swapped for the document default in silence. A second `@info` overwrote the
  first one without a word.

  Every text field of `@info` is trimmed now. The three URL fields go through
  the absolute URL check, and a rejected one reports `invalid-url` and is
  dropped on its own. The rest of the decorator is kept, because the version
  and the description are not at fault. A blank `version` reports the new
  `empty-info-version` and still falls back to the default. A license with a
  blank name reports the new `empty-license-name`, and the whole license is
  dropped. A second `@info` on one namespace reports the new
  `duplicate-info-decorator`.

  `@useServer` took a bare string and checked nothing. A blank name reached the
  document as `$ref: "#/servers/"`. A name that no `@server` declares reached it
  as a reference to nothing. Both make the official parser reject the whole
  document, and neither was reported.

  The name is tested as written against the character set `@server` uses for the
  key it declares. A name outside that set reports the new
  `invalid-use-server-name`, and the `@useServer` is dropped. Whether a `@server`
  declares the name is checked while the document is built, because a `@server`
  can arrive after the decorator runs. An undeclared name reports the new
  `undeclared-used-server`, which is a warning, and the entry is dropped.

  `@asyncTag` and `@contentType` trim before the blank check. A value of spaces
  alone passed a length test before, so the tag carried a name no consumer can
  match and the message carried a media type that names no format. Both report
  the code they already had, and both record the trimmed value.

  An augment decorator that runs more than once is accepted. An augment
  decorator runs once per declaration of its target, so one `@@info` statement
  ran again for every reopened `namespace` block. The second run looked like a
  second application, and it reported a build-breaking error. The guard records
  where the application was written, so a repeat run of one statement proceeds.
  Two distinct statements are still reported.

  Every public reader hands out a copy. `getInfo`, `getExternalDocs`,
  `getCorrelationId`, `getAsyncTags`, `getMessageExamples` and
  `getJsonSchemaExtensions` returned the stored state itself, so a caller could
  change the emitted document by changing what a reader gave it.

  `AsyncAPIInfoState`, `ExternalDocsState`, `JsonSchemaExtensionRecord`,
  `AsyncAPISecuritySchemeState`, `AsyncAPIServerState` and
  `AsyncAPIServerVariableState` are `@public`. Each is the return type of a
  `@public` reader, and each was tagged `@internal` before.

  A build can fail where it succeeded before. Five of the new codes are errors:
  `invalid-url` on an `@info` field, `empty-info-version`, `empty-license-name`,
  `duplicate-info-decorator` and `invalid-use-server-name`. A project that wrote
  a relative URL in `@info`, a blank `version`, a blank license name, two `@info`
  on one namespace, or a `@useServer` name outside the allowed character set
  built without a word before this release. That build fails now. Each of those
  five sources also produced a document the official parser rejects.

- b4762e8: Remove the headers slot from `SchemaArtifactIndex`.

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

- daff94e: Drop the whole binding where a required binding field is rejected, and drop a
  nested binding object that has no field left in it.

  Three sites reported an error and then emitted the binding anyway: the
  `deadLetterQueue` of an `@sqsChannel`, one entry of the `queues` of an
  `@sqsOperation`, and the `schema` of a `@googlePubSubMessage`. The build failed
  on the error while a document came out beside it, and that document was short
  of a queue or a schema the author had declared. Each of the three now drops the
  binding, which is what the message of `missing-binding-field` already said.

  The new `invalid-required-binding-field` error covers the other half of the
  same rule. `invalid-binding-field` is a warning that keeps the rest of the
  binding, and it stays that way. A rejected value on a field the binding cannot
  be written without costs the whole binding, so it reports the new code instead.
  The `queue` and the `deadLetterQueue` of an SQS channel, the `queues` of an SQS
  operation and the `schemaSettings` of a Google Cloud Pub/Sub channel report it.
  A `deadLetterQueue` is optional, and it costs the binding all the same. The
  author declared a queue there, and a binding written without it describes less
  than the source does.

  An empty nested object is now dropped in the two bindings that emitted one.
  `redrivePolicy`, `policy` and `tags` of an SQS queue emitted `{}`, and so did a
  Solace `destinations` entry whose only field was rejected. An empty object
  states nothing, an absent field states the same, and every other binding
  already dropped it. A `destinations` list left with no entry is dropped as
  well.

  `@kafkaChannel` no longer crashes the compiler on a `topicConfiguration` the
  serializer cannot represent. A custom scalar with an `init` inside that object
  raised a `TypeError` out of the decorator. The field now goes through the
  shared object check, so the value is reported and dropped and the rest of the
  Kafka binding is kept.

  A project that left a required binding field out gets the same errors it got
  before. The emitted document no longer carries the partial binding.

  A build can fail where it succeeded before. The `queue` and the
  `deadLetterQueue` of an SQS channel, the `queues` of an SQS operation and the
  `schemaSettings` of a Google Cloud Pub/Sub channel reported
  `invalid-binding-field`, which is a warning. They report
  `invalid-required-binding-field` now, which is an error. A project that wrote a
  rejected value on one of those four fields built with a warning before this
  release. That build fails now.

- 00dc835: Apply `@encode` to the union variants the encoding describes, and keep one
  format on a property.

  `@encode("unixTimestamp", int32) ts: utcDateTime | null` wrote the encoded
  `type` onto the union itself. The schema then asked for an integer that was
  also a string or a null, so no value satisfied it. Nothing was reported.

  The encoding is written onto each variant the encoding describes. A `null`
  variant is left alone. A variant that refers to a named scalar is written in
  place, the same way a plain scalar property carrying `@encode` writes its
  scalar in place. The replaced branch keeps the `@doc`, the `@summary` and the
  validation keywords of the scalar it came from. A component that no reference
  reaches is no longer emitted beside it.

  A variant is encoded only when the encoding describes it. The compiler accepts
  `@encode("unixTimestamp", int32)` on `utcDateTime | string`, because one
  variant is a moment in time. Both variants were described as integers before,
  so a legal string payload failed its own schema.

  A property typed as a named union emitted a bare `$ref`, and a `$ref` carries
  no encoding. So `@encode("unixTimestamp", int32) ts: Stamp` described a string
  where an integer travels. A use site whose encoding describes a variant now
  writes the whole union in place. A site that does not encode still refers to
  the component.

  `ISO8601` is named among the encodings a `duration` answers. The table left it
  out, and an encoding the table does not name is read as a custom one. Every
  scalar variant is said to describe a custom encoding, so
  `@encode("ISO8601") d: duration | string` described the `string` variant as a
  duration too.

  An `@encode` on a union that describes none of its variants reports the new
  `encoding-describes-no-variant`, which is a warning. The emitted schema is
  unchanged. Each variant keeps the shape its own type states, which is what
  this path already did in silence.

  `@secret` counts among the formats a property states. It is written into the
  schema as `format: "password"`, and it was not among the decorators that make
  a property write its scalar in place. A property carrying it over a scalar
  that has a format of its own described the value as a uuid and a password at
  once.

  A base format is dropped at every `allOf` depth. Hoisting this level's format
  onto the wrapper left the base's format inside the branch, so a value carried
  two. A format is a draft-07 annotation rather than a keyword `allOf`
  intersects, so two of them contradict each other. An `extends` chain of three
  scalars wraps one `allOf` inside another, and the removal now follows the
  whole spine. A branch that is a `$ref` keeps its format, because that format
  lives in a shared component.

  A model that extends a named collection is built once. The base was built
  twice: once to learn whether it was a collection, and once to write the `$ref`
  branch. A second build of a declaration promotes it from an inline shape to a
  component. So an element landed inline or behind a `$ref` depending on whether
  some other model happened to extend the same collection. An element that is an
  unsupported type reported `unsupported-payload-type` twice.

  A message payload no longer claims the key of the model it comes from. The
  model's own component is often never built, so the claim reserved a key that
  no schema is written under. Another type computing the same key was then
  reported as a duplicate of a component that does not exist, and every
  reference to that key dangled.

  `MessageNode.rawPayloadRef` and `rawHeadersRef` are removed. Nothing set them,
  and their doc comment forbade what the lower stage does. The lower stage keeps
  the job the code already gives it, and it reports rather than raising a
  `TypeError` when the message it looks up is absent.

### Patch Changes

- d0cd6b6: Report a dropped binding once, and state a reason that holds at every site.

  A `persistence` outside the two values Pulsar defines reported three times. It
  reported `invalid-binding-field`, which says the rest of the binding was kept.
  It then reported `missing-binding-field`, which says the binding does not give
  a field the author had given. The binding was dropped after both. The field
  now reports `invalid-required-binding-field` alone, which is the code that
  says what happens.

  The message of `invalid-required-binding-field` said AsyncAPI requires the
  field. That is not true at every site. The `deadLetterQueue` of an
  `@sqsChannel` is optional, and a rejected value there still costs the binding.
  The message now says the binding cannot be written without the field.

  An `@sqsOperation` read every entry of its `queues` list before it dropped the
  binding on the first bad entry. A field of a later entry was then reported as
  kept, beside the error that dropped the whole binding. The decorator now stops
  at the first entry it refuses.

## 0.3.0

### Minor Changes

- 16aa769: Refuse a `@header` on a model that declares a Protobuf message or an Avro
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
