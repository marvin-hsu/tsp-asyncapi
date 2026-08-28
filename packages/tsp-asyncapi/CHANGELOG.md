# Changelog

## 0.7.1

### Patch Changes

- Show decorator documentation on hover in the TypeSpec editor.

  The language service reads `/** */` on declarations in `lib/main.tsp`. It
  ignores TypeScript JSDoc, and it ignores `//` comments next to `extern dec`.
  Every decorator now has a doc comment, with `@param` on each argument, so
  hovering `@server` or `@avroRecord` shows what the decorator takes.

  Comments in the TypeScript sources follow the same short-sentence style.
  Behaviour is unchanged.

- Updated dependencies
  - tsp-asyncapi-core@0.4.1
  - tsp-avro@0.3.1

## 0.7.0

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

- 00dc835: Read `@Avro.logicalType`, `@Avro.fixed` and `@Avro.aliases` along the chain a
  scalar extends, and refuse four sources that were written out wrong.

  A TypeSpec scalar carries what it extends, and the primitive table already
  matched through that chain. The three marks did not. `scalar CreatedAt extends
Ts` wrote a bare `long`, and `scalar Digest extends Md5` wrote a bare `bytes`.
  The type on the wire was right and the meaning was gone, with no diagnostic.
  Each mark now reads the nearest declaration in the chain. The nearest one wins,
  so write the decorator again to say something else.

  `@Avro.aliases` targets a scalar. `@Avro.fixed` makes a named Avro type of a
  scalar, and a named type is what an alias stands for. A fixed model already
  took one and a fixed scalar could not, while the walk read the aliases of both.

  Four sources are refused that were written out before.

  A named type may not take the name of an Avro primitive. Avro spells a
  primitive by name alone, so `model int` was written into a schema that a reader
  reads back as the primitive. The eight primitive names are reserved: `null`,
  `boolean`, `int`, `long`, `float`, `double`, `bytes` and `string`. The six
  complex keywords are free, because Avro spells a complex type as an object.
  This reports `invalid-name`.

  A scalar that carries `@Avro.fixed` extends `bytes`. An Avro fixed type is a
  width of bytes, and `@Avro.fixed(4) scalar F extends string` was written out as
  a fixed type all the same. A scalar that extends nothing is still written as
  the fixed type, because it says nothing else. This reports `invalid-fixed`.

  `@Avro.aliases` on a scalar written as an Avro primitive is refused. An alias
  stands for a name, and a primitive has none. This reports the new
  `aliases-target`.

  A union that holds no branch is refused. `union Nothing {}` was written out as
  `"type": []`. An Avro union is a list a reader picks one branch from, and an
  empty list leaves nothing to pick. This reports `unsupported-type`.

  A record or an array default is carried on an optional field. `x?: Inner = #{
a: "z" }` was refused for belonging to no branch of its union. The value names
  no branch of its own, and `["null", Inner]` leaves one place for it to sit. The
  refusal now stands only where more than one branch could carry the default. The
  default is serialized against the branch it sits in, rather than against the
  whole union. A union handed to the compiler has no form there, and the answer
  was `{}`, so the field carried a default no reader can use.

  A union of one branch is folded where the union is built. A field already wrote
  such a union as the type itself. The items of an array and the values of a map
  did not, so `U[]` came out as `["string"]` and put a union index on the wire
  that no reader needed.

  A refusal that is about a decorator on a scalar points at the scalar
  declaration. `aliases-target` and the `underlying` form of `invalid-fixed`
  pointed at the field that used the scalar, so an editor drew the error on code
  the author cannot fix. Each is reported once per declaration now, rather than
  once per field.

  An empty Avro namespace is joined as no namespace. The split of a full name
  hands back the empty namespace for a name that carries none, and the join read
  that as a namespace and wrote `".Event"`.

  The message of `unsupported-type` for a scalar names what to write instead.
  Avro has eight primitive types, and `utcDateTime`, `offsetDateTime`,
  `plainDate`, `plainTime`, `duration` and `decimal` are none of them. The
  message says to declare the field as a type Avro carries, and to write the
  meaning with `@Avro.logicalType`.

  A build can fail where it succeeded before. Every diagnostic of this package is
  an error. A project that named a record, an enum or a fixed type after an Avro
  primitive built before this release. So did one that wrote `@Avro.fixed` on a
  scalar extending an Avro type other than `bytes`, one that wrote
  `@Avro.aliases` on a scalar written as a primitive, and one that declared a
  union with no branch. Each of those four wrote a schema that says something
  other than the source does.

  The `tsp-avro` peer range of `tsp-asyncapi` moves to `0.3.x`, and the Avro
  payloads guide names that range. The library is not at 1.0, so its supported
  range follows its releases.

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

- Updated dependencies [00dc835]
- Updated dependencies [b4762e8]
- Updated dependencies [daff94e]
- Updated dependencies [00dc835]
- Updated dependencies [d0cd6b6]
- Updated dependencies [00dc835]
  - tsp-asyncapi-core@0.4.0
  - tsp-avro@0.3.0

## 0.6.0

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

### Patch Changes

- Updated dependencies [16aa769]
- Updated dependencies [16aa769]
  - tsp-avro@0.2.0
  - tsp-asyncapi-core@0.3.0

## 0.5.0

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

### Patch Changes

- Updated dependencies [746fd94]
- Updated dependencies [2d01651]
- Updated dependencies [8e262e9]
  - tsp-asyncapi-core@0.2.0

## 0.4.1

Exports `PACKAGE_NAME`. The 0.4.0 entry introduced it as this package's name,
the one `tspconfig.yaml` writes, but `index.ts` never exported it.

Also takes `tsp-asyncapi-core@0.1.1`, which fixes the same omission there.

## 0.4.0

**Breaking for a tool that imports from this package in JavaScript or
TypeScript. Not breaking for a project that writes TypeSpec.**

The emitter is now two packages. `tsp-asyncapi-core` declares the decorators
and the semantic model, and this package turns that model into an AsyncAPI
document. The compiler reads `$onEmit` from a package's entry point, so one
package can hold one emitter, and selecting an output by package name needs
more than one package.

**A TypeSpec project changes nothing.** `import "tsp-asyncapi";` still brings
in every decorator, because this package's `lib/main.tsp` forwards to core in
one line. `tspconfig.yaml` is unchanged, and so is every option name. Every
diagnostic code keeps its `tsp-asyncapi/` prefix: both packages register a
library under that one name, which the compiler supports.

**The output is byte-for-byte identical.** No document changes.

The two packages version independently. This one is 0.4.0 and continues the
history you already have; `tsp-asyncapi-core` is new and starts at 0.1.0. The
dependency between them is a `~` range, so a minor release of core does not
reach a project until this package takes it.

**A JavaScript or TypeScript import may need a new source.** 79 names moved to
`tsp-asyncapi-core`: the 24 readers for decorator state, the 51 state types,
and `$lib` with `reportDiagnostic`, `createDiagnostic`, and `LIBRARY_NAME`.

```js
// Before
import { getChannel, listMessages } from "tsp-asyncapi";
// After
import { getChannel, listMessages } from "tsp-asyncapi-core";
```

This package does not re-export them. Doing so would make it permanently
responsible for core's public surface, which is the coupling the split
removes. `@typespec/openapi3` does not re-export `@typespec/http` either.

The document object types did not move. `AsyncAPIDocument`, `ChannelObject`,
every binding object, and the rest are still imported from `tsp-asyncapi`. This
package's API describes the document it emits, completely.

`PACKAGE_NAME` is new. It is this package's name, which is what
`tspconfig.yaml` writes and what a test host asks the compiler to load.

## 0.3.0

**Behavior changes.** No public export was removed, and no decorator changed
its signature, so a project on 0.2.1 upgrades without editing a line of
TypeSpec. Five checks did get narrower or wider, and each one can change what
an existing program emits or reports. Regenerate and read the diff.

- The `asyncapi-id` and `default-content-type` options now answer to the rule
  every other text field answers to. A blank option is absent, and one that
  says something is trimmed. Both were a bare truthiness test, so a blank
  option reached the document and a padded one kept its padding. The options
  schema sets no minimum length, so an author can write either.
- An array index inside a raw schema `$ref` is now only what RFC 6901 spells:
  `0`, or a digit run with no leading zero. The reader passed the token to
  `Number`, which also reads `""` and `" "` as 0, and `"01"`, `"1.0"`, `"+1"`,
  `"0x1"` and `"1e0"` as 1. Such a `$ref` was reported as resolving. It now
  reports `unresolved-raw-schema-ref`, so a program that carried one starts
  reporting where it did not before.
- A value the serializer cannot represent is now reported and dropped, however
  deep it sits. A failure inside an array reached the document as `null`, and
  one inside an object made that member vanish, both without a word. This
  covers `@binding` and `@jsonSchemaExtension` as well as `@extension`.
- A runtime expression may now hold a line terminator inside a JSON Pointer
  token. RFC 6901 puts no character outside a reference token, and both JSON
  and YAML carry one inside a member name. `@correlationId`,
  `@parameterLocation` and `@replyAddress` all take such an expression.
- A tag metadata conflict is now reported once per declaration. The report
  came out once per reader instead, so one disagreement on a service namespace
  was named two or three times, depending on whether that namespace also
  carried servers or a channel.

### Features

- `@extension` writes one `x-` specification extension on the object its
  target emits. It reaches four objects: `info`, a channel, an operation, and
  a message. A target that emits several of them gets the extension on each
  one. The decorator is repeatable, and the emitted keys follow source order.
  The value is any JSON value, and it is emitted as written.

  A key outside the specification pattern reports `invalid-extension-key`;
  the prefix alone is not enough, because the official parser rejects `x-`
  and `x-has space`. The same key twice on one target reports
  `duplicate-extension-key`, and the first application in source order is
  kept. A value the serializer cannot represent reports
  `unserializable-extension`. A target that emits none of the four objects
  reports `extension-target-not-emitted`.

  A server and a security scheme are not supported. Both are declared with a
  named argument on a namespace, so one `@extension` cannot name which of
  them it means. For a keyword inside a JSON Schema, use
  `@jsonSchemaExtension` instead.

### Tests

The suite carries 53 fast-check properties over seven pure modules. It carried
15 before. Every one was validated by mutation: the module it covers was
broken the way its plan named, and the property had to turn red. Three of the
five behavior changes above are defects those properties found.

### Documentation

- A fifteenth example writes an `x-` field on each object that takes one.
- The other fourteen documents were regenerated. They had not been rebuilt
  since 0.2.1, so the committed output still showed the channel keys and the
  folded lines of 0.2.0.
- Both READMEs record one thing this emitter cannot fix. A member named
  `__proto__` inside a decorator's object value never reaches it: the compiler
  marshals such a value by assigning each member, and an assignment to that
  name sets the prototype instead of adding a member.

## 0.2.1

**Breaking change.** Without an explicit `channelId`, `@channel` now keys the
channel by its address instead of the declaration name of the target. With a
broker such as Kafka, the address is the topic name, and the topic name is
what a reader looks the channel up by. `@dynamicChannel` still keys by the
declaration name, because it has no address. To keep an old key, pass it as
`channelId`. Every `$ref` that points into a channel follows the key, so
regenerate and read the diff.

Two channels without explicit ids that share one address now collide on the
key and report `duplicate-channel-id`. Before, they were both emitted and
only warned through `duplicate-channel-address`. Declare the operations of
one address inside one scope, or give each channel its own `channelId`.

### Fixes

- A `$ref` longer than 80 columns is no longer wrapped across two lines in
  the emitted YAML. A wrapped `$ref` is legal YAML, but a plain-text search
  for the pointer does not find it.

### Documentation

- The rules for `components.schemas` and `components.messages` keys are now
  written down: namespace qualification, what `@friendlyName` overrides, and
  how a character outside the key charset is rewritten.
- The operations page shows one operation that carries several messages, the
  usual shape of a topic with several event variants.

## 0.2.0

Twelve more protocols, and the emitter now checks the field rules of each one
rather than passing whatever it was given straight through.

No public export was removed, and no decorator changed its signature, so a
project on 0.1.4 upgrades without editing a line of TypeSpec.

The emitted document does change, and only where 0.1.4 was wrong. Six
decorators were read and then dropped, so a source that used any of them now
produces more than it did. `@discriminated` emitted a bare `anyOf` and now
emits the envelope the specification describes. Regenerate and read the diff
before committing it: every difference should be something you had asked for
all along. The Fixes section below lists them.

### Protocol bindings

Version 0.1.4 shipped four Kafka decorators and the generic `@binding`.
Twelve protocols join them, which is thirty-one binding decorators in all.

| Protocol             | Member         | Binding version | Objects                     |
| -------------------- | -------------- | --------------- | --------------------------- |
| MQTT                 | `mqtt`         | 0.2.0           | server, operation, message  |
| HTTP                 | `http`         | 0.3.0           | operation, message          |
| AMQP 0-9-1           | `amqp`         | 0.3.0           | channel, operation, message |
| NATS                 | `nats`         | 0.1.0           | operation                   |
| Pulsar               | `pulsar`       | 0.1.0           | server, channel             |
| Google Cloud Pub/Sub | `googlepubsub` | 0.2.0           | channel, message            |
| Amazon SQS           | `sqs`          | 0.2.0           | channel, operation          |
| Anypoint MQ          | `anypointmq`   | 0.0.1           | channel, message            |
| JMS                  | `jms`          | 0.0.1           | server, channel, message    |
| IBM MQ               | `ibmmq`        | 0.1.0           | server, channel, message    |
| Solace               | `solace`       | 0.4.0           | server, operation           |
| WebSocket            | `ws`           | 0.1.0           | channel                     |

Every field table was read from the `@asyncapi/specs` JSON schema rather than
from prose, so the member names, the allowed values and the ranges are the
ones the official parser enforces. Each protocol is validated end to end
against that parser.

A named decorator writes `bindingVersion` for you, so an author can no longer
write the wrong one.

Five reserved member names get no decorator, and the reference page says why.
`amqp1`, `redis` and `stomp` carry no field at all. `mercure`, `mqtt5` and
`ros2` are rejected by the AsyncAPI parser at every level of a 3.0 document.

### Diagnostics

Four new codes.

- `missing-binding-field` (error). A binding that leaves out a field its
  specification requires cannot be written as a valid document, so the whole
  binding is dropped. Pulsar needs `namespace` and `persistence`, Pub/Sub
  needs `schemaSettings`, SQS needs `queue` and `queues`, and JMS needs
  `jmsConnectionFactory`. Every missing field of one object is reported, not
  only the first.
- `duplicate-channel-address` (warning). Two channels that carry one address
  produce a valid document, and a reader cannot tell which set of messages
  that address actually carries.
- `visibility-not-applied` (warning). A `@visibility` that the emitter cannot
  act on, rather than silently ignoring it.
- `unserializable-default` (warning). A default the serializer cannot
  represent is left out instead of half-written.

### Fixes

- `@externalDocs` on a model reached no part of the document. It now lands on
  that model's schema.
- `@encode`, `@invisible`, `@visibility`, `@secret`, property defaults and
  `#deprecated` were each read and then dropped. All six now reach the
  schema.
- `@discriminated` emitted a bare `anyOf` instead of the envelope AsyncAPI
  describes.
- Messages could come out in an order that depended on which build ran, and a
  binding consumed by one build could stay marked for the next. Both are
  gone; the emitter holds no state between builds.
- The service namespace's tags never reached the servers, although the field
  is defined on the Server Object.
- IBM MQ allows `headers` on a binary payload and on no other. The emitter
  passed both through, writing a document the parser rejects.

### Two field names need backticks

`is` on the AMQP channel binding and `namespace` on the Pulsar channel
binding are both TypeSpec keywords, so an author writes `` `is` `` and
`` `namespace` ``. The emitted names are unchanged.

### Internals

The emitter is now a three-stage pipeline: `resolve` turns the program and the
decorator state into a semantic model, `lower` turns that model into the
document, and serialization writes the bytes. Nothing is shared between the
stages except values, which is what will make versioning and multi-service
output possible later.

This changed no output. A byte-for-byte baseline over ten programs held
across every step.

## 0.1.4 and earlier

No changelog was kept. Use the commit history.
