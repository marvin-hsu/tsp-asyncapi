---
outline: 2
---

# Diagnostics

Every warning and error the emitter can report, with what causes it and how to fix it. Diagnostic codes appear in compiler output as `tsp-asyncapi/<code>`.

## Errors

### `duplicate-schema-key`

> Duplicate schema name: '\<name\>'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.

Two declarations resolved to the same `components.schemas` key. Typical causes: two `@friendlyName`s resolving to the same string, or a declared model whose name matches a template instantiation's derived name (e.g. declaring `model PageString` while also using `Page<string>`).

**Fix:** rename one declaration, or give one of them a distinct `@friendlyName`. The emitter never renames either side automatically.

### `payload-schema-key-taken`

> Schema key '\<name\>' is claimed twice. Message '\<message\>' lifts @header fields into its `headers`, so its payload needs a schema of its own, and that schema is keyed after the message model. Rename the other type that claims '\<name\>', or describe the headers of '\<message\>' with @headers so its payload keeps every field.

A message that lifts `@header` fields cannot reuse the model's own schema: that schema still describes the lifted fields, which now belong to `headers`. The payload therefore gets a component of its own, keyed after the message model with a `Payload` suffix. Another declaration already claims that key.

The payload shape is emitted inline instead. A reference to the model's own component would describe the lifted fields as payload data, so the message would contradict its own `headers`.

**Fix:** rename the other type, or describe the headers with [`@headers`](./decorators/messages#headers) so the payload keeps every field and needs no separate schema.

### `raw-schema-key-taken`

> Schema key '\<name\>' is claimed twice. Message '\<message\>' carries a raw schema that another message carries too, so that schema is written once in `components.schemas` under a key derived from the message model. Rename the other type that claims '\<name\>', or give one of the two messages a different name.

Two or more messages carry the same [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders). The schema is written once in `components.schemas`, keyed after the first message that carried it, with a `Payload` or `Headers` suffix. Another declaration already claims that key.

The raw schema is written in each message instead. Nothing is lost, and the document repeats the text.

**Fix:** rename the other type, or rename one of the two messages so the derived key changes.

### `unsupported-payload-type`

> The emitter does not support a \<kind\> here. Use a model, scalar, enum, union, or literal value instead.

A property or payload position names a TypeSpec entity the schema layer cannot convert — an `Interface`, `Namespace`, `Operation`, and so on. The compiler itself does not reject this; only the emitter does.

**Fix:** replace the reference with a model, scalar, enum, union, or literal type.

### `unrepresentable-circular-reference`

> This anonymous type refers back to itself with no named type in between. A plain (non-$ref) schema cannot express that cycle. Give the type a name so it can be referenced through $ref instead.

An anonymous type cycles back to itself, e.g. `alias Foo = { a: Foo };`. Anonymous types inline (they have no `components.schemas` entry), and an inline schema cannot express a cycle.

**Fix:** turn the anonymous type into a named `model`. Named types reference each other through `$ref`, which handles cycles fine.

### `duplicate-message-key`

> Duplicate message name: '\<name\>'. Two @message models resolve to the same components.messages key. Pass an explicit name to @message on one of them.

Two `@message` models resolved to the same `components.messages` key. Typical causes: two same-named models in different namespaces (a message key drops the namespace prefix a schema key keeps), or two `@friendlyName`s resolving to the same string.

Two instantiations of one template that produce the same key are not reported — there is only one `@message` in the source, and both refer to the same emitted component.

**Fix:** pass an explicit name to `@message` on one of them.

### `duplicate-message-decorator`

> @message is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @message.

`@message` is not repeatable. Stacking it silently keeps just one application, so the extra names never reach the document.

**Fix:** remove the extra `@message`.

### `duplicate-content-type-decorator`

> @contentType is applied to this model more than once. A message carries one content type, so only one application takes effect and the rest are discarded. Remove the extra @contentType.

`@contentType` is not repeatable. A message has one `contentType` field, so stacking the decorator would silently discard every value but one.

**Fix:** remove the extra `@contentType`.

### `empty-content-type`

> @contentType was given an empty media type. A blank media type names no format, so it cannot reach the emitted message. This @contentType was dropped, and the message falls back to the document defaultContentType. Give it a media type, such as 'application/json'.

An application of [`@contentType`](./decorators/messages#contenttype) passed a blank media type. The value is trimmed first, so a value of spaces alone is blank. A blank media type names no format, so the emitter cannot write it into the message.

The message falls back to the document `defaultContentType`, the same result an absent `@contentType` gives. The user typed the empty string on purpose, so that fallback is reported rather than silent.

**Fix:** give the decorator a media type, such as `application/json`, or remove it.

### `duplicate-headers-decorator`

> @headers is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @headers.

`@headers` is not repeatable. Stacking it silently keeps just one application, so the other headers models never reach the document.

**Fix:** remove the extra `@headers`.

### `duplicate-message-headers`

> This message takes its headers from more than one source. The three sources are a field marked @header, a model given to @headers, and a schema given to @rawHeaders. There is no rule that picks one over the others, so no `headers` were emitted at all. Keep one of the sources.

A message declares headers from more than one source. The three sources are a field marked `@header`, a model given to `@headers`, and a schema given to `@rawHeaders`. The emitter defines no priority between them, so it emits none of them. The marked fields stay in the payload, so nothing you wrote disappears while the error is unresolved.

**Fix:** keep one source. Move the marked fields into the `@headers` model, or drop the `@headers` or the `@rawHeaders`.

### `duplicate-raw-payload-decorator`

> @rawPayload is applied to this model more than once. A message carries one payload, so only one application takes effect and the rest are discarded. Remove the extra @rawPayload.

`@rawPayload` is not repeatable. A message has one `payload` field, so stacking the decorator would silently discard every schema but one.

**Fix:** remove the extra `@rawPayload`.

### `duplicate-raw-headers-decorator`

> @rawHeaders is applied to this model more than once. A message carries one headers schema, so only one application takes effect and the rest are discarded. Remove the extra @rawHeaders.

`@rawHeaders` is not repeatable, for the reason `@rawPayload` is not.

**Fix:** remove the extra `@rawHeaders`.

### `empty-schema-format`

> This decorator was given an empty schemaFormat. A blank schemaFormat names no schema language, so it cannot reach the emitted message. This decorator was dropped, and the message falls back to the schema built from the model. Give it a format, such as 'application/vnd.apache.avro;version=1.9.0'.

An application of [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders) passed an empty string, or a string of whitespace only. A blank format names no schema language, so the emitter cannot write it into the message.

Nothing is recorded. The message falls back to the schema built from the model, the same result an absent decorator gives.

**Fix:** give the decorator a format, such as `application/vnd.apache.avro;version=1.9.0`, or remove it.

### `invalid-raw-schema`

> The schema given to this decorator cannot be represented as JSON, so it would write nothing into the document. This decorator was dropped, and the message falls back to the schema built from the model. Write the schema as a value the emitter can serialize, such as an object value or a string.

The `schema` argument of [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders) is a value the compiler cannot serialize to JSON. A custom scalar with its own `init` constructor is the usual cause.

This check does not require an object, unlike [`invalid-binding-config`](#invalid-binding-config). AsyncAPI types the `schema` field as `any`, so a string and an array are legal.

**Fix:** write the schema as a value the emitter can serialize, such as an object value or a string.

### `non-string-raw-schema`

> '\<format\>' is not a JSON based schema language, so AsyncAPI requires its schema to be inlined as a string. This schema was given as an object, and it is emitted as written. Write the schema as a string, such as the text of the .proto definition, or name a format that is JSON based.

The `schemaFormat` of [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders) names a schema language that is not JSON based, and the `schema` argument is not a string. AsyncAPI states that such a schema must be inlined as a string. Protobuf is the example the specification gives, and the two Protobuf identifiers are the listed formats this rule covers.

The schema is emitted as written, the same choice [`unknown-schema-format`](#unknown-schema-format) makes. You decide which half to change.

**Fix:** write the schema as a string, such as the text of the `.proto` definition, or name a format that is JSON based.

### `string-raw-schema`

> '\<format\>' is a JSON based schema language, so AsyncAPI requires its schema to be inlined rather than given as text to be parsed. This schema is a string that opens a JSON object or array, and the official parser rejects a document that carries one. Write the schema as an object value. Note that a bare JSON string is still allowed, because a format such as Avro names its primitive types that way.

The `schemaFormat` of [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders) names a JSON based schema language, and the `schema` argument is a string whose first non-blank character opens an object or an array. AsyncAPI requires such a schema to be inlined as a value, not handed over as text for a reader to parse.

A string that does not open an object or an array is left alone. Avro, for one, names its primitive types with a bare string such as `"long"`.

This is the mirror of [`non-string-raw-schema`](#non-string-raw-schema), which covers a format that is not JSON based being given an object.

**Fix:** write the schema as an object value rather than as a quoted string.

### `raw-schema-local-ref`

> This schema refers to '\<ref\>', and it is written in '\<format\>'. AsyncAPI requires both ends of a $ref to carry the same schemaFormat. Every schema the emitter writes into the document is an AsyncAPI Schema Object, so the two ends disagree. The schema is emitted as written. Inline the definition instead of referring to it, or write this schema in the AsyncAPI Schema Object format.

The schema given to [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders) carries a top-level `$ref` that starts with `#/`, and its `schemaFormat` is not the AsyncAPI Schema Object format. Such a reference points into the emitted document. Every schema the emitter writes there is an AsyncAPI Schema Object, so the target carries a different `schemaFormat` than the schema that refers to it.

Only the top level of the raw schema is read. A reference nested deeper is written in the schema language itself, and the emitter does not read that language.

**Fix:** inline the definition instead of referring to it, or write the schema in the AsyncAPI Schema Object format, such as `application/vnd.aai.asyncapi+json;version=3.1.0`.

### `unresolved-raw-schema-ref`

> This schema refers to '\<ref\>', and the emitted document holds nothing there. A reference that starts with '#/' points into this document, and the emitter writes every location it can reach. A parser rejects the document as written. Note that a model reaches components.schemas only when some message uses it, and a @rawPayload model is not such a message. Point at a location the document holds, or inline the definition instead of referring to it.

The schema given to [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders) carries a top-level `$ref` that starts with `#/`, and the finished document holds nothing at that location. The emitter copies a raw schema exactly as written, so the reference is yours. A `#/` reference points into the emitted document, and the emitter owns every location there. So it can say that this one is missing.

The common cause is a reference to the raw model itself, such as `#/components/schemas/OrderCreated` on the model `OrderCreated`. A `@rawPayload` model claims no `components.schemas` key of its own, so that target only exists when another message reaches the same model.

The check runs on the finished document, after every section is in place. Only the top level of the raw schema is read, the same depth [`raw-schema-local-ref`](#raw-schema-local-ref) reads. A reference that fails both rules is reported twice, because the two rules are independent.

**Fix:** point at a location the document holds, or inline the definition instead of referring to it.

### `raw-payload-lifted-header`

> The message model '\<name\>' carries @rawPayload and also lifts @header fields into its `headers`. The emitter emits the raw payload exactly as written, so it cannot remove the lifted fields from a schema it does not read. The raw payload and the headers are both emitted, and they can describe the same field twice. Describe the headers of '\<name\>' with @headers or @rawHeaders, or drop the @header marks and let the raw schema carry those fields.

A message carries `@rawPayload` and at least one field marked `@header`. A lifting message normally gets a payload schema of its own, and that schema leaves the lifted fields out. A raw payload is opaque, so the emitter cannot leave anything out of it. The Avro or Protobuf record may still declare the field the message claims as a header.

Both halves are still emitted. The raw payload reaches the message as written, and the lifted fields still become the `headers`. Nothing you wrote disappears while the error is unresolved. This differs from [`duplicate-message-headers`](#duplicate-message-headers), which drops both sources. There, two sources fill one field. Here, two things fill two different fields.

The message is reported as well when the lifted fields come from a base message the model extends.

**Fix:** describe the headers with `@headers` or `@rawHeaders`, or drop the `@header` marks and let the raw schema carry those fields.

### `headers-not-object`

> The model '\<name\>' given to @headers is backed by an array. AsyncAPI requires the headers schema to be a key/value map, so no `headers` were emitted. Pass a model with properties instead.

The model given to `@headers` emits `type: "array"` — it `is` an array, or it extends one. AsyncAPI requires the `headers` schema to describe a key/value map.

**Fix:** pass a model with properties, or a `Record<T>`-backed model. Both emit an object schema.

### `discriminated-lifted-header`

> The message model '\<name\>' lifts @header fields into its `headers` and also carries @discriminator. The discriminator names the subtype schemas, and those describe the lifted fields as payload data, so no payload could satisfy the message. The emitter leaves the discriminator off the payload schema. Describe the headers of '\<name\>' with @headers instead, so its payload keeps every field.

A message model carries [`@discriminator`](./decorators/schemas#discriminator) and also lifts `@header` fields. The discriminator sends a reader to the subtype schemas, and every subtype still describes the lifted fields as payload data. No payload of this message could satisfy any of them.

The keyword is left off the payload schema. The polymorphism still reaches the document through the model's own component, which describes every field.

**Fix:** describe the headers with [`@headers`](./decorators/messages#headers) instead, so the payload keeps every field.

### `content-type-header-conflict`

> The header '\<name\>' names the message content type, and this message also carries @contentType. AsyncAPI has one field for the content type, so two sources for it are ambiguous. Remove the @header field and keep @contentType.

A header field is named `content-type` (the comparison uses the emitted wire name and ignores case), and the same message also carries `@contentType`. AsyncAPI keeps the content type in its own message field, so the two sources cannot both be honoured. `@typespec/http` reclassifies such a header because HTTP has no other way to state it; the emitter does have `@contentType`, so it reports instead of choosing.

The check covers both headers mechanisms. The field may carry `@header` on the message model, or it may be a property of the model given to `@headers`, including a property that model inherits.

**Fix:** remove the header field and keep `@contentType`.

### `duplicate-correlation-id-decorator`

> @correlationId is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @correlationId.

`@correlationId` is not repeatable. Stacking it silently keeps just one application, so the other locations never reach the document.

**Fix:** remove the extra `@correlationId`.

### `invalid-correlation-id-location`

> '\<location\>' is not a legal correlation id location, so no `correlationId` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/MQMD/CorrelId'.

The location does not match the AsyncAPI runtime expression grammar. The expression starts with `$message.header` or `$message.payload` and is followed by a `#`. Everything after the `#` is a JSON Pointer, so it is either empty or starts with `/`.

The `#` is required. The prose ABNF of the specification reads as if the fragment were optional, but the normative JSON Schema of the specification requires it, and the official AsyncAPI parser rejects a document that carries the bare `$message.header`.

Only the format is checked: the pointer may name a path no schema declares, which AsyncAPI's own examples do.

**Fix:** write a location the grammar accepts, such as `$message.header#/correlationId`.

### `empty-message-example`

> This @messageExample carries neither `headers` nor `payload`, so it shows nothing about the message. This example was dropped. Give it at least one of the two.

An application of `@messageExample` gave an empty value, or gave only `name` and `summary`. A Message Example Object with no content says nothing about the message.

**Fix:** give the example a `headers` value, a `payload` value, or both.

### `empty-tag-name`

> @asyncTag was given an empty name. The `name` of an AsyncAPI Tag Object is required, and no consumer can match a blank one. This tag was dropped. Give it a name.

An application of [`@asyncTag`](./decorators/document-info#asynctag) passed a blank tag name. The value is trimmed first, so a name of spaces alone is blank. `name` is required on an AsyncAPI Tag Object, so a blank one names nothing a consumer can match.

**Fix:** give the tag a name.

### `conflicting-tag-metadata`

> Tag '\<name\>' is declared more than once here, with a different '\<field\>'. AsyncAPI emits one Tag Object per name on an object, so only one of the two values can be kept. The first one in source order was kept. Merge the @asyncTag applications into one, or give them different names.

Two applications of [`@asyncTag`](./decorators/document-info#asynctag) on one target name the same tag and give one of its fields two different values. AsyncAPI emits one Tag Object per name on an object, so one of the two values would have to be dropped. The emitter reports the ambiguity rather than choosing silently.

Applications that set _different_ fields merge instead, and so do a built-in `@tag` and an `@asyncTag` of the same name. The same name on two _different_ targets is never a conflict: AsyncAPI gives every object its own independent `tags` array.

**Fix:** merge the two applications into one, or give them different names.

### `invalid-extension-key`

> The extension key '\<key\>' is not a specification extension name. AsyncAPI reads only a key of the shape 'x-' followed by one or more letters, digits, underscores, dots, or hyphens, so this @extension was dropped. Rename the key to that shape.

An application of [`@extension`](./decorators/document-info#extension) passed a key the AsyncAPI Specification Extensions pattern rejects. The pattern is `^x-[\w\d\.\-\_]+$`. Any other key would be an unknown field in the emitted object, and the official parser rejects the document.

A bare `x-` is one such key. It has the prefix but no name after it. A key with a space is another.

**Fix:** rename the key to `x-`, then one or more letters, digits, underscores, dots, or hyphens.

### `duplicate-extension-key`

> The extension key '\<key\>' is applied to this target more than once. An object carries one value per key, so this @extension was dropped and the first one with this key in source order was kept. Remove the extra @extension, or give it another key.

Two applications of [`@extension`](./decorators/document-info#extension) on one target pass the same key. An emitted object carries one value per key, so one of the two values would have to be dropped.

The same key on two _different_ targets is never a conflict. Every emitted object carries its own set of extensions.

**Fix:** remove the extra application, or give it another key.

### `duplicate-server-name`

> Duplicate server name: '\<name\>'. Each @server on a namespace needs its own name, because the name is the key of that server in the emitted document. This @server was dropped, and the first one with this name in source order was kept.

Two `@server` applications on the same namespace share a name. The name is the key of the `servers` map, so the two would collide. The emitter never picks one silently.

**Fix:** Give one of them a different name.

### `empty-server-field`

> Empty server field: '\<field\>'. AsyncAPI requires a value for this field on every server. This @server was dropped.

`host` or `protocol` is blank, or holds only spaces. Both are required by the Server Object. A blank value passes the type check but makes the document invalid, so the whole server is dropped.

**Fix:** Give the field a real value.

### `invalid-server-name`

> Invalid server name: '\<name\>'. AsyncAPI only allows letters, digits, '_', and '-' in a server name. This @server was dropped.

The name is outside the character set AsyncAPI allows for a key of the root `servers` map. This set is stricter than the one for the Components Object. A dot is not allowed here.

**Fix:** Use a name that only holds letters, digits, `_`, and `-`. The emitter never rewrites the name, because that would silently change the key you asked for.

### `empty-channel-address`

> @channel was given a blank address. A blank address names no topic, path, or routing key, so it cannot reach the emitted document. This channel was dropped. Give it an address, such as 'orders.created', or use @dynamicChannel when the address is only known at runtime.

The address is empty, or it only holds whitespace. The channel is dropped.

**Fix:** give the channel an address. Use `@dynamicChannel` when the address is only known at runtime.

### `invalid-channel-address`

> The channel address '\<address\>' carries a query string. AsyncAPI states that a channel address must not use query parameters, and that a channel binding describes them instead. This channel was dropped. Move everything after the '?' into a channel binding.

Three problems report this code. The address holds a query string, the address holds a fragment, or its `{}` pairs are unbalanced or nested. The message names which of the three it is. The channel is dropped in every case.

The scheme and the host are not checked. A full URL such as `wss://example.com/socket` is a legal address.

**Fix:** move a query string or a fragment into a channel binding. Pair up the braces, and do not nest them.

### `invalid-channel-param-name`

> '\<name\>' is not a legal channel address parameter name. Only the characters a-z, A-Z, 0-9, '-', and '_' are allowed, because the name is also the key of that parameter in the emitted `parameters` map and the name of the TypeSpec property that declares it. This channel was dropped.

A `{name}` in the address falls outside the character set. The name is also the name of the TypeSpec property that declares the parameter, so a name outside the set can never be declared.

**Fix:** rename the expression to one that holds only letters, digits, `-`, and `_`.

### `empty-channel-id`

> The channel id given to this decorator is blank. The id is the key of this channel in the emitted `channels` map, and a blank key names nothing. This channel was dropped. Give it an id, or leave the argument out so the address, or the interface or namespace name for a dynamic channel, is used.

The explicit channel id argument is empty, or it only holds whitespace.

**Fix:** give the channel an id, or leave the argument out. Without it, the address is the key. A dynamic channel has no address, so its key is the declaration name of the interface or namespace.

### `duplicate-channel-decorator`

> @channel is applied to this interface or namespace more than once. A channel carries one address, so only one application takes effect and the rest are discarded. Remove the extra @channel.

`@channel` is not repeatable. A channel holds one address, so stacking the decorator would silently discard every address but one.

**Fix:** remove the extra `@channel`. Declare a second channel on a second interface or namespace.

### `duplicate-dynamic-channel-decorator`

> @dynamicChannel is applied to this interface or namespace more than once. Only one application takes effect, and the rest are discarded. Remove the extra @dynamicChannel.

`@dynamicChannel` is not repeatable, for the reason `@channel` is not.

**Fix:** remove the extra `@dynamicChannel`.

### `conflicting-channel-decorators`

> @channel and @dynamicChannel are both applied to this interface or namespace. One states an address and the other states that the address is unknown, and no rule picks a winner, so no channel was emitted at all. Keep one of the two.

Both channel decorators reached one target. One states an address, and the other states that the address is unknown. Nothing picks a winner, so the target gets no channel at all.

**Fix:** keep one of the two decorators.

### `duplicate-channel-id`

> Duplicate channel id: '\<id\>'. Each channel needs its own id, because the id is the key of that channel in the emitted document. This channel was dropped, and the first one with this id in source order was kept. Pass an explicit id to @channel on one of them.

Two channels resolved to one key of the `channels` map. Two channels that share an address do this, because the address is the default key. Two dynamic channels of one name in different namespaces do this as well, because a channel key drops the namespace prefix. Two explicit ids that hold one string do it too.

**Fix:** pass an explicit id to `@channel` or `@dynamicChannel` on one of them.

### `missing-channel-param`

> The channel address uses '{\<name\>}', but no operation in this channel declares a parameter with that name. AsyncAPI requires the `parameters` map to cover every expression in the address. Add a '\<name\>' parameter to an operation of this channel, or take the expression out of the address.

The address holds an expression that no operation of the channel declares. The emitted `parameters` map still covers the whole address, with an empty Parameter Object for that name.

**Fix:** add the parameter to an operation of the channel, or take the expression out of the address.

### `unused-channel-param`

> The parameter '\<name\>' is not used by the address of channel '\<id\>'. An operation parameter whose type is not a @message model describes a channel address parameter, and the emitter never rewrites the address to absorb one. Add '{\<name\>}' to the address, or mark the parameter type with @message.

An operation of the channel declares a parameter the address never names. Every top-level operation parameter whose type does not carry `@message` describes a channel address parameter, so this one has nowhere to go.

**Fix:** add the expression to the address, or mark the parameter's type with `@message` so it counts as a message instead.

### `non-string-channel-param`

> The channel parameter '\<name\>' is not declared as a string. The AsyncAPI Parameter Object has no `schema` field, so a channel parameter carries no type and its value is always a string. Declare it as a string, a string literal, a union of string literals, or a string-backed enum.

The declared type is not a string type. The AsyncAPI Parameter Object holds `enum`, `default`, `description`, `examples`, and `location`, and no `schema`, so there is nowhere to put a type.

**Fix:** declare the parameter as a string, a string literal, a union of string literals, or a string-backed enum.

### `optional-channel-param`

> The channel parameter '\<name\>' is optional. A Channel Address Expression is a bare '{name}' with no operator, so a separator next to it cannot disappear along with the value, whatever the position in the address. Make the parameter required, and give the Parameter Object a `default` through a TypeSpec default value if it usually carries one value.

The declaration is optional. This is an error whatever the position of the expression in the address. A Channel Address Expression is a bare `{name}`. It has none of RFC 6570's operators, so a separator next to an absent value cannot disappear with it.

**Fix:** make the parameter required. Give it a TypeSpec default value when it usually carries one value. That value becomes the `default` of the Parameter Object.

### `conflicting-channel-param`

> The channel parameter '\<name\>' is declared more than once in channel '\<id\>', with a different '\<field\>'. AsyncAPI emits one Parameter Object per name on a channel, so only one of the two values can be kept. The first one in source order was kept. Give the two declarations the same type, default, documentation, examples, and location.

Two operations of one channel declare one parameter name with a different type, default, `@doc`, `@example`, or `@parameterLocation`. A channel holds one Parameter Object per name, so one of the two values has to go. The first one in source order is kept, so the rest of the document stays readable.

The two types are compared by the values they allow, not by the way they are written. Two operations that each write `"eu" | "us"` inline agree.

**Fix:** give the two declarations the same type, default, documentation, examples, and location.

### `duplicate-parameter-location-decorator`

> @parameterLocation is applied to this property more than once. A channel parameter carries one location, so only one application takes effect and the rest are discarded. Remove the extra @parameterLocation.

`@parameterLocation` is not repeatable. A Parameter Object holds one `location` field.

**Fix:** remove the extra `@parameterLocation`.

### `invalid-parameter-location`

> '\<location\>' is not a legal channel parameter location, so no `location` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.payload#/user/id'.

The runtime expression is outside the grammar. It must start with `$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The `#` is required, because the normative JSON Schema of the specification requires it.

**Fix:** write the expression in that form, such as `$message.payload#/user/id`.

### `duplicate-send-decorator`

> @send is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @send.

`@send` is not repeatable. An Operation Object holds one `action` field.

**Fix:** remove the extra `@send`.

### `duplicate-receive-decorator`

> @receive is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @receive.

`@receive` is not repeatable, for the same reason `@send` is not.

**Fix:** remove the extra `@receive`.

### `conflicting-operation-actions`

> @send and @receive are both applied to this operation. One states that this application sends the message and the other states that it receives one, and no rule picks a winner, so no operation was emitted at all. Keep one of the two.

The two decorators state opposite directions. Nothing picks a winner, so the operation is dropped rather than emitted with an arbitrary action.

**Fix:** keep one of the two. Two directions over one channel are two operations, so write a second operation for the other direction.

### `empty-operation-id`

> The operation id given to this decorator is blank. The id is the key of this operation in the emitted `operations` map, and a blank key names nothing. This operation was dropped. Give it an id, or leave the argument out so the operation name is used.

The id is the key of the operation in the emitted document, and a blank key names nothing.

**Fix:** give the argument an id, or leave it out so the operation name is used.

### `duplicate-operation-id`

> Duplicate operation id: '\<id\>'. Each operation needs its own id, because the id is the key of that operation in the emitted document. This operation was dropped, and the first one with this id in source order was kept. Pass an explicit id to @send or @receive on one of them.

Two operations resolve to one key. The key comes from the explicit id argument, and otherwise from the name of the operation. The first one in source order keeps the key.

**Fix:** pass an explicit id to `@send` or `@receive` on one of them.

### `duplicate-reply-channel-decorator`

> @replyChannel is applied to this operation more than once. A reply points at one channel, so only one application takes effect and the rest are discarded. Remove the extra @replyChannel.

`@replyChannel` is not repeatable. An Operation Reply Object holds one `channel` field.

**Fix:** remove the extra `@replyChannel`.

### `duplicate-reply-address-decorator`

> @replyAddress is applied to this operation more than once. A reply carries one address, so only one application takes effect and the rest are discarded. Remove the extra @replyAddress.

`@replyAddress` is not repeatable. An Operation Reply Object holds one `address` field.

**Fix:** remove the extra `@replyAddress`.

### `invalid-reply-address-location`

> '\<location\>' is not a legal reply address location, so no `address` was emitted on the reply. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/replyTo'.

The runtime expression is outside the grammar. It must start with `$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The grammar is the one `@correlationId` and `@parameterLocation` follow.

**Fix:** write the expression in that form, such as `$message.header#/replyTo`.

The five codes below come from the protocol bindings, and two more appear under Warnings. See [Protocol Bindings](/reference/bindings/) for the decorators that report them.

### `duplicate-binding`

> The protocol '\<protocol\>' already has a binding at the \<level\> level on this target. A Bindings Object carries one member per protocol, and two configurations are neither merged nor allowed to overwrite each other. This binding was dropped, and the first one in source order was kept. Keep one of the two, and note that @binding("\<protocol\>", ...) claims the same member as the decorator named after that protocol.

One protocol is claimed twice at one level on one target. `@binding("kafka", ...)` next to `@kafkaChannel` is the same mistake, because both write the `kafka` member.

**Fix:** keep one of the two decorators.

### `empty-binding-protocol`

> The protocol name given to @binding is blank. The name becomes a member name of the emitted `bindings` object, and a blank member name is not legal. This binding was dropped. Name the protocol, such as `kafka` or `mqtt`.

The protocol name becomes a key in the emitted document. A blank key names nothing.

**Fix:** name the protocol.

### `invalid-binding-config`

> The config given to @binding("\<protocol\>", ...) is not an object. Every member of a Bindings Object is an object, so this binding was dropped. Write the config as an object value, such as #{ qos: 2 }.

AsyncAPI defines every member of a Bindings Object as an object. A string, a number, and an array are all rejected.

**Fix:** write the config as an object value.

### `invalid-required-binding-field`

> The \<protocol\> binding field '\<field\>' expects \<expected\>. The value given here is outside that. The binding cannot be written without the field, so the whole binding was dropped. Write '\<field\>' as \<expected\>.

One field carries a value the binding specification forbids. The emitter cannot write the binding without that field, so the whole binding is dropped rather than the field alone. That is the difference from [`invalid-binding-field`](#invalid-binding-field), which is a warning and keeps the rest of the binding.

Some fields report it. They are the `queue` and the `deadLetterQueue` of an Amazon SQS channel, the `queues` of an SQS operation, the `schemaSettings` of a Google Cloud Pub/Sub channel, and the `persistence` of a Pulsar channel. A `deadLetterQueue` is optional, and it still costs the binding. The author declared a queue, so a binding written without it describes less than the source does.

**Fix:** write the field as the message names.

### `missing-binding-field`

> The \<protocol\> binding requires the field '\<field\>', and this binding does not give it. AsyncAPI would reject the emitted document, so the whole binding was dropped. Add '\<field\>' to the decorator config.

Several bindings state fields the author has to give. A Pulsar channel needs a `namespace` and a `persistence`. A Google Cloud Pub/Sub channel needs `schemaSettings`, and that object needs an `encoding` and a `name`. An Amazon SQS channel needs a `queue`, and that queue needs a `name` and a `fifoQueue`. An SQS operation needs a `queues` list with at least one entry. A JMS server needs a `jmsConnectionFactory`.

A blank string counts as absent. A name of spaces names nothing, so it is worth no more than no field at all.

Every missing field of one object is reported, not only the first. Reporting one at a time would send the author round the loop twice.

**Fix:** add the field the message names to the decorator config.

### `duplicate-security-scheme-name`

> Duplicate security scheme name: '\<name\>'. Each @securityScheme needs its own name, because the name is the key of that scheme in components.securitySchemes. This @securityScheme was dropped, and the first one with this name in source order was kept.

Two `@securityScheme` applications share a name. The name is the key of the `components.securitySchemes` map, so the two would collide. The schemes are collected across the whole program, so two applications on different namespaces clash as well.

**Fix:** Give one of them a different name.

### `invalid-security-scheme-name`

> Invalid security scheme name: '\<name\>'. AsyncAPI only allows letters, digits, '.', '-', and '_' in a components key. This decorator was dropped.

The name is outside the character set AsyncAPI allows for a key of the Components Object. A dot is allowed here, unlike in a key of the root `servers` map.

Two decorators report this. `@securityScheme` writes the name as a key of `components.securitySchemes`. `@useSecurity` writes it into a JSON Pointer that addresses such a key, and a character outside the set makes the pointer malformed.

**Fix:** Use a name that only holds letters, digits, `.`, `-`, and `_`. The emitter never rewrites the name.

### `empty-security-scheme-field`

> Empty security scheme field: '\<field\>'. AsyncAPI requires a value for this field on this kind of scheme. This @securityScheme was dropped.

A required string field of the scheme is empty, or holds whitespace only. This covers `name` on `httpApiKey`, `scheme` on `http`, and `openIdConnectUrl` on `openIdConnect`. A blank value passes the type check and then makes the document invalid.

**Fix:** Give the field a value.

### `missing-oauth-flow-url`

> The '\<flow\>' OAuth flow needs a '\<field\>'. A blank value counts as a missing one, because no client can call it. This @securityScheme was dropped.

An OAuth flow leaves out a URL that AsyncAPI requires for that flow. `implicit` and `authorizationCode` need an `authorizationUrl`. `password`, `clientCredentials`, and `authorizationCode` need a `tokenUrl`.

**Fix:** Give the flow the URL it needs.

### `empty-oauth-flows`

> This oauth2 scheme declares no flow. A client then has no way to obtain a token. This @securityScheme was dropped. Declare at least one of `implicit`, `password`, `clientCredentials`, and `authorizationCode`.

The `flows` field of an `oauth2` scheme is an empty object.

**Fix:** Declare at least one flow.

### `invalid-url`

> The '\<field\>' value '\<url\>' is not an absolute URL. AsyncAPI requires an absolute URL here, and a parser rejects the whole document over a relative one. This decorator was dropped. Write a URL with a scheme, such as 'https://example.com/token'.

A URL field holds a value that is not an absolute URL. A relative reference such as `/token` fails, and so does free text. AsyncAPI marks these fields with the `uri` format, and a parser rejects the document over a value that fails it.

Three decorators report this. `@securityScheme` reports it for `openIdConnectUrl` and for the `authorizationUrl`, `tokenUrl`, and `refreshUrl` of each OAuth flow. A flow URL is named together with its flow, such as `implicit.authorizationUrl`. `@externalDocs` reports it for the link it carries, which reaches `info` and every server. `@info` reports it for `termsOfService`, `contact.url`, and `license.url`.

`@info` drops the field alone and keeps the rest of the decorator. The other two drop the whole decorator. The message says which of the two happened.

**Fix:** Write the URL with a scheme, such as `https://example.com/token`.

### `empty-info-version`

> @info was given a blank version. The `version` of an AsyncAPI Info Object is required, and a blank one names no version of the application. The version falls back to the document default. Give it a version, such as '1.0.0'.

The `version` given to `@info` is blank. The value is trimmed first, so a value of spaces alone is blank. AsyncAPI requires the field, so the version falls back to `0.0.0`.

**Fix:** give `@info` a version, such as `1.0.0`.

### `empty-license-name`

> @info was given a license with a blank name. The `name` of an AsyncAPI License Object is required, and a blank one names no license. The whole license was dropped, and the rest of the decorator was kept. Give the license a name, such as 'MIT'.

The `license` given to `@info` holds a blank `name`. The value is trimmed first, so a value of spaces alone is blank. AsyncAPI requires the field, so a License Object without it names no license.

The whole license is dropped, `license.url` included. The rest of `@info` is kept.

**Fix:** give the license a name, such as `MIT`.

### `duplicate-info-decorator`

> @info is applied to this namespace more than once. A document carries one Info Object, so only one application takes effect and the rest are discarded. Remove the extra @info.

`@info` is applied to one namespace more than once. A document carries one Info Object, so only one application takes effect. Decorators on one declaration run bottom-up, so the application written last runs first and wins.

**Fix:** merge the applications into one, and remove the extra `@info`.

### `conflicting-generated-schema-source`

> Two preview features generate the payload schema of this model: '\<first\>' and '\<second\>'. There is no order between them, so the emitter cannot choose one. Turn one of the two off in `preview-features` in `tspconfig.yaml`.

Two [preview features](./emitter-options#preview-features) both generated a payload schema for one model.

The emitter picks neither. A winner would be the order the emitter lists its providers in, and that order is not something a project states.

No document is written. Both artifacts are gone, so the model would fall back to the schema its TypeSpec type produces, and that file would answer the request with output that ignores it.

**Fix:** Remove one of the two names from `preview-features` in `tspconfig.yaml`.

### `preview-feature-unavailable`

> The preview feature '\<feature\>' is not available in this release. It is a name the emitter reserves, and the provider behind it is not built yet. Remove '\<feature\>' from `preview-features` in `tspconfig.yaml`.

The [`preview-features`](./emitter-options#preview-features) option names a feature that has no provider in this release. The reserved names are `protobuf` and `avro`. Both have a provider in this release, so no name reports this today. A name outside the reserved set fails the option schema instead, and never reaches this diagnostic.

No file is written. A document emitted next to this error would ignore the request without saying so.

**Fix:** Remove the name from `preview-features` in `tspconfig.yaml`.

### `protobuf-artifact-unavailable`

> Model '\<name\>' carries @Protobuf.message, and no namespace above it carries @Protobuf.package. A generated payload is the proto3 text of a whole package, so the model needs one. Add @Protobuf.package to the namespace that holds this model.

> Model '\<name\>' of package '\<package\>' reaches \<construct\>, and proto3 has nothing the emitter can write it as. So this message has no generated payload. Describe that part with a construct proto3 covers, or remove @Protobuf.message from the model.

> Scalar '\<scalar\>' has no proto3 type, and no scalar it extends has one either. So model '\<name\>' of package '\<package\>' has no generated payload. Give the field a scalar that extends one of the Protobuf scalar types.

Three problems report this code, and the message names which one it is. The model has no package above it. The model reaches a construct the emitter cannot write as proto3. A field uses a scalar that maps to no proto3 type.

The second message names the construct it stopped at. The emitter writes the proto3 text of one payload, and that text carries no `import` line. It refuses every construct that has no honest form there:

- a union, or any other property type proto3 has no form for
- an anonymous model
- a template instantiation
- a type that carries `@Protobuf.externRef`, which includes the well known types
- a property with no `@Protobuf.field` number
- an array of `Protobuf.Map` values, which proto3 has no form for
- a `Protobuf.Map` inside another type, such as the value of another map
- a `Protobuf.Map` keyed by a type proto3 cannot key a map with
- a `Protobuf.Map` whose value is an array, because a map value takes no label
- a `Protobuf.Map` with no key and value
- a `Protobuf.Map` of values, not types
- a model or enum of another Protobuf package
- a model or enum that no `@Protobuf.package` covers
- a model or enum whose name another declaration of the payload already takes
- an enum whose first variant is not zero
- an enum with a variant that is not an integer
- a `@Protobuf.package` declaration the emitter cannot read
- a `@Protobuf.reserve` list the emitter cannot read

Four entries name state the emitter cannot read. They are the `Protobuf.Map`
with no key and value, the `Protobuf.Map` of values, the `@Protobuf.package`
declaration, and the `@Protobuf.reserve` list. That state belongs to another
library, and that library promises nothing about the shape of it. A shape this
emitter does not know is refused rather than guessed at. A guess would put
wrong proto3 text in the document and say so nowhere.

The third message names the scalar. The emitter maps the 15 scalars the Protobuf library maps. Nine of them are built in TypeSpec scalars, and six come from the Protobuf library. It also follows the chain a custom scalar extends. A scalar whose chain reaches none of the 15 has no type to write.

A model that carries `@Protobuf.message` and no `@AsyncAPI.message` reports nothing. It asks for no payload, so a project that uses the official decorators for other types keeps its build green.

The `protobuf` preview feature reports this while it collects generated payloads. A model this code names gets no generated payload. The emitter reports the problem instead of writing an empty one, because an empty payload reads as a schema that describes nothing.

The package of a model is decided by the nearest namespace above it that carries `@Protobuf.package`. The emitter reads the decorator state, so a renamed package is matched by the name it declares.

**Fix:** add `@Protobuf.package` to the namespace of the model. For the other two messages, change the type the message names, or remove `@Protobuf.message` from the model.

### `header-on-generated-payload`

> Property '\<name\>' of message '\<message\>' carries @header, and the model carries \<decorator\>. A header travels beside the payload, and neither Protobuf nor Avro has a way to describe a property the payload does not carry. Move the headers into their own model and point at it with @headers.

A message model carries `@header` on one of its own fields, and it also carries `@Protobuf.message` or `@Avro.avroRecord`.

`@header` says the property travels beside the payload. Neither target language has that idea. Protobuf gives every property of a message a field number, and Avro gives every property of a record a field, so a property the payload does not carry has nowhere to go and no way to be marked as absent.

Leaving the property out of the generated schema is the other option, and it is worse. `@typespec/protobuf` and the Avro emitter both write the whole model, and neither reads an AsyncAPI decorator. The schema in the document and the standalone file would then describe different shapes for one message, and nothing in either file would say so.

Every marked property is named. Fixing one and compiling again to find the next is a round trip this can spare.

This is reported before any emitter runs, so it holds for a project that emits a document, for one that emits only schema files, and for one that emits nothing. No file is written.

A mark on a model reached from the message is a different case. That model is not a message, so the mark means nothing there, and [`nested-header-ignored`](#nested-header-ignored) reports it instead.

**Fix:** move the headers into their own model and point at it with `@headers`. The message model then holds the payload alone, and every writer of every file agrees about which fields belong where.

### `avro-artifact-unavailable`

> Model '\<name\>' carries @Avro.avroRecord, and the Avro walk refused it: \<reason\> So this message has no generated payload. Describe that part with a construct Avro covers, or remove @Avro.avroRecord from the model. Emitting the Avro files themselves reports every reason rather than the first.

A model carries `@Avro.avroRecord` and `@AsyncAPI.message`, and `tsp-avro` refused to build a schema for it. The reason comes from that library and is quoted in the message.

Only the first reason is quoted. The Avro walk keeps going after a refusal, so one model can collect several. To read all of them, put `tsp-avro` in `emit` and compile again.

No document is written. The payload of that model would fall back to the schema its TypeSpec type produces. That file answers a request for Avro with ordinary JSON Schema, and nothing in it says so.

A model that carries `@Avro.avroRecord` and no `@AsyncAPI.message` reports nothing. It asks for no payload, so a project that writes Avro records for other types keeps its build green.

**Fix:** change the part of the model the reason names, or remove `@Avro.avroRecord` from the model.

### `avro-library-missing`

> The preview feature 'avro' is on, and 'tsp-avro' could not be loaded: \<reason\> That library holds the Avro walk, and the emitter carries no copy of it. Install 'tsp-avro' beside the emitter, or remove 'avro' from `preview-features` in `tspconfig.yaml`.

The [`preview-features`](./emitter-options#preview-features) option names `avro`, and the load of `tsp-avro` failed. The message quotes what the load reported.

`tsp-avro` is an optional peer dependency of the emitter. It is loaded only when the feature is on, so a project that never turns it on never needs it. A project that turns it on installs it itself.

No document is written. Every Avro payload the project asked for is missing, and a document without them describes something else.

**Fix:** install `tsp-avro`, or remove `avro` from `preview-features` in `tspconfig.yaml`.

## Warnings

### `duplicate-channel-address`

> Channel '\<id\>' and channel '\<other\>' both use the address '\<address\>'. AsyncAPI allows it, because the two have different ids, but a reader cannot tell which set of messages one address actually carries. Give them one channel with both operations, or give each its own address.

Two channels carry the same address. The document stays valid, because their ids differ and each names its own messages, so this is a warning.

The address is what exists at runtime; the channel id is not. A reader of the document therefore cannot tell which set of messages that one address carries.

A [`@dynamicChannel`](./decorators/channels#dynamicchannel) is never reported. Its address is `null` because the address is unknown until runtime, so two of them state nothing about each other.

Only the second channel of a pair is reported, and the message names the first.

**Fix:** put both operations on one channel, or give each channel its own address.

### `channel-no-messages`

> Channel '\<id\>' has no recognizable messages. Did you forget to annotate the payload models with '@message'? The channel was emitted without a `messages` map.

No operation of the channel names a model that carries `@message`. The channel is still emitted, and the `messages` field is left out. AsyncAPI makes that field optional, so the document stays valid, but a channel with no message is almost always a payload model that lost its `@message`.

**Fix:** mark the payload models with `@message`. Check that the operations sit directly inside the interface or namespace that carries the channel. A nested interface is a separate scope.

### `duplicate-use-server`

> @useServer names the server '\<name\>' more than once on this channel. AsyncAPI requires the entries of a channel's `servers` array to be unique, so one reference was emitted. Remove the extra @useServer.

One name reached `@useServer` twice on one channel. AsyncAPI requires the entries of the array to be unique, so the emitter emits one reference.

**Fix:** remove the extra `@useServer`.

### `invalid-use-server-name`

> Invalid server name: '\<name\>'. @useServer emits a reference to the key of that server in the root `servers` map, and AsyncAPI only allows letters, digits, '_', and '-' in such a key. A blank name is no key either. This @useServer was dropped.

The name given to `@useServer` uses a character AsyncAPI does not allow in a key of the root `servers` map. The name is tested as written, the same way `@server` tests the key it declares. A space is outside the allowed set, so a padded name is rejected on both sides. The emitter does not rewrite the name, because that would change the server the author asked for.

**Fix:** write the name with letters, digits, `_`, and `-` only.

### `undeclared-used-server`

> @useServer names the server '\<name\>', and no @server on the service namespace declares it. The emitted reference would point at nothing, and no parser could resolve it. This entry was dropped. Declare a @server with this name, or correct the name.

`@useServer` names a server that no `@server` on the service namespace declares. The emitted reference would address a key the document does not carry. A parser rejects the whole document over such a reference, so the entry is dropped.

**Fix:** declare a `@server` with this name on the service namespace, or correct the name.

### `use-server-without-channel`

> @useServer names the server '\<name\>', but this interface or namespace carries neither @channel nor @dynamicChannel. Only a channel has a `servers` field, so this @useServer reaches no part of the document. Add @channel, or remove this @useServer.

`@useServer` sits on a target that carries no channel. Only a channel holds a `servers` field, so the application reaches no part of the document.

**Fix:** add `@channel` or `@dynamicChannel` to the target, or remove the `@useServer`.

### `operation-without-channel`

> The operation '\<name\>' carries @send or @receive, and the interface or namespace around it carries no emitted channel. An operation always points at a channel, so this one reaches no part of the document. This operation was dropped. Add @channel or @dynamicChannel to the interface or namespace that holds it.

An operation always points at a channel. The channel may be missing because the target carries no channel decorator. It may also be missing because the declared channel was dropped, such as one that lost a [`duplicate-channel-id`](#duplicate-channel-id) clash.

**Fix:** add `@channel` or `@dynamicChannel` to the interface or namespace that holds the operation. Check that the operation sits directly inside it, because a nested interface is a separate scope.

### `unsupported-operation-message-type`

> A \<kind\> cannot name the messages of an operation. This emitter does not unwrap it into messages. Write each message as its own parameter, or as a variant of a union. Mark each model with `@message`.

An operation parameter or return type names a `Tuple`, such as `[OrderCreated, OrderShipped]`. That looks like a list of types. It is not a list of messages.

The emitter does not unwrap the tuple. Doing so would invent two messages the signature never named as extra parameters or as union variants. The type is dropped from the message list. The rest of the document is still written.

**Fix:** write each message as its own parameter, or as a variant of a union. Mark each model with [`@message`](./decorators/messages#message).

### `reply-channel-not-a-channel`

> @replyChannel names '\<name\>', and that interface or namespace carries no emitted channel. A reply whose channel is unknown carries neither a checkable message list nor a checkable address, so the whole `reply` object was dropped. Add @channel or @dynamicChannel to '\<name\>'.

The named target carries no channel that reached the document. The whole `reply` object goes, not the channel alone. A partial reply would state something the author never wrote.

**Fix:** add `@channel` or `@dynamicChannel` to the named target.

### `reply-address-needs-dynamic-channel`

> @replyAddress is given, and the reply channel '\<id\>' carries an address. AsyncAPI requires the address of that channel to be null when a reply address is given. The `address` was dropped from the reply, and the rest of the reply was kept. Declare '\<id\>' with @dynamicChannel instead of @channel.

A reply address is what the address of the reply channel is at runtime. A channel that already carries an address would then state two addresses, which AsyncAPI forbids.

**Fix:** declare the reply channel with [`@dynamicChannel`](./decorators/channels#dynamicchannel), or remove the `@replyAddress`.

### `reply-without-action`

> @replyChannel or @replyAddress is applied to an operation that carries neither @send nor @receive. A reply sits on an emitted operation, so this decorator reaches no part of the document. Add @send or @receive to this operation, or remove the reply decorator.

A reply sits on an emitted operation, and only `@send` or `@receive` emits one.

**Fix:** add `@send` or `@receive` to the operation, or remove the reply decorator.

### `undeclared-server-variable`

> The template '{\<name\>}' in this server has no matching entry in `variables`. A reader cannot tell what to put there. The server is still emitted, with the template text unchanged. Add '\<name\>' to `variables`, or take the template out of `host` and `pathname`.

The `host` or the `pathname` of a server holds a `{var}` template, and the `variables` field of the same server declares no entry for that name. The names of both fields are read as one set.

**Fix:** Add the name to `variables`, or remove the template from the field.

### `unused-server-variable`

> The variable '\<name\>' is declared on this server, and neither `host` nor `pathname` uses a '{\<name\>}' template. The variable is still emitted. Use it in one of the two fields, or remove it.

The `variables` field declares an entry that no template refers to. AsyncAPI substitutes a variable into `host` and `pathname` only, so the entry has no effect.

**Fix:** Use the name in one of the two fields, or drop the entry.

### `duplicate-server-variable-value`

> The `enum` of the server variable '\<name\>' names '\<value\>' more than once. AsyncAPI requires the entries to be unique, so a repeat makes the whole document fail validation. The repeat was dropped.

A server variable's `enum` lists the same value twice. AsyncAPI requires the entries to be unique, and a repeat makes the whole document fail validation.

The repeat is dropped and the variable survives. An error would stop the emitter before it could write the document this message describes.

**Fix:** remove the repeated entry.

### `server-variable-default-not-in-enum`

> The variable '\<name\>' has the default '\<default\>', which is not one of its `enum` values. A client that takes the default then holds a value the same variable forbids. Both values are still emitted.

One variable declares both a `default` and an `enum`, and the default is outside the list. AsyncAPI does not forbid this, so both values reach the document.

**Fix:** Add the default to the `enum`, or change the default to a listed value.

### `blank-server-variable-value`

> The `\<field\>` of the server variable '\<name\>' holds an entry that is blank. A blank entry names no value, so it was dropped. A list left with no entry at all is dropped whole, and the variable is then emitted without it. Give every entry a value, or remove the ones that carry none.

The `enum` or the `examples` of a server variable holds an entry that is empty, or holds whitespace only. Such an entry names no value, so it is dropped. A list that ends up with no entry is left out of the variable altogether.

**Fix:** Give every entry a value, or remove the blank ones.

### `blank-security-scope-name`

> The `scopes` of this security scheme hold an entry that is blank. A blank entry names no scope, so it was dropped. A list left with no entry at all still reaches the document, and AsyncAPI reads it as 'this scheme needs no scope'. Give every entry a scope name, or remove the ones that carry none.

The `scopes` of an `oauth2` or an `openIdConnect` scheme holds an entry that is empty, or holds whitespace only. Such an entry names no scope, so it is dropped. An empty `scopes` still reaches the document, and AsyncAPI reads it as "this scheme needs no scope", which is a different claim.

**Fix:** Give every entry a scope name, or remove the blank ones.

### `unknown-oauth-scope`

> The scope '\<scope\>' is not listed in `availableScopes` of any flow of this scheme. The name still reaches the document. Add it to a flow, or remove it from `scopes`.

The `scopes` of an `oauth2` scheme names a scope that no flow of that scheme lists in `availableScopes`. The documentation of `@securityScheme` states `scopes` as a subset of those maps.

The name is kept. Dropping it would rewrite `scopes` in silence, and AsyncAPI would then claim a different set.

**Fix:** add the name to `availableScopes` of a flow, or remove it from `scopes`.

### `use-security-outside-server`

> @useSecurity('\<schemeName\>') on namespace '\<namespace\>' was dropped. The `security` array sits on a server, and this namespace declares no @server. Move this @useSecurity to the namespace that carries @server.

`@useSecurity` is applied to a namespace that declares no server. The emitter writes the `security` array onto a server object, so the application has nowhere to go.

**Fix:** Move the `@useSecurity` to the namespace that carries `@server`, or use `@@useSecurity` to augment it from where you are.

### `undeclared-security-scheme`

> @useSecurity('\<schemeName\>') names a security scheme that no @securityScheme defines. The emitted reference would point at nothing, and no parser could resolve it. This entry was dropped. Declare a @securityScheme with this name, or correct the name.

`@useSecurity` names a scheme that the program never declares. The entry on a server is a reference into `components.securitySchemes`, so the reference would address a key the document does not carry.

**Fix:** Add a `@securityScheme` with this name, or correct the name in the `@useSecurity`.

### `message-key-shadows-schema-key`

> Message name '\<name\>' is also the components.schemas key of a different type, so a reader can misread this message as describing that type. A message key drops the namespace prefix that a schema key keeps, which makes the two overlap. Pass a different name to @message.

The document stays valid — `components.messages` and `components.schemas` are separate maps, so nothing actually collides. The risk is to the reader: `components.messages.Sales.Ev` and `components.schemas["Sales.Ev"]` look like the same thing while describing different types.

**Fix:** pass a different name to `@message`.

### `sanitized-message-key`

> Message name '\<requested\>' is not a legal components.messages key, so it was emitted as '\<emitted\>'. A key may only use the characters a-z, A-Z, 0-9, '.', '-', and '_'.

The name given to `@message` falls outside the Components Object key charset, so the emitter encoded the offending characters. The emitted key is therefore not the string that was asked for.

**Fix:** pass a name that only uses `a-z`, `A-Z`, `0-9`, `.`, `-`, and `_`.

### `unknown-schema-format`

> '\<format\>' is not one of the schemaFormat values AsyncAPI requires or recommends. A custom value is legal, so this one is still emitted. A custom value must not be one of the listed identifiers used with another meaning. Check the spelling, and note that every listed value carries a version, such as 'application/vnd.apache.avro;version=1.9.0'.

The `schemaFormat` given to [`@rawPayload`](./decorators/messages#rawpayload) or [`@rawHeaders`](./decorators/messages#rawheaders) is outside the list AsyncAPI names. The list holds the values a tool must support and the values the specification recommends. A missing `;version=` part is the usual cause.

The value is still emitted, because the specification allows a custom value. The specification also states that a custom value must not collide with a listed one. The emitter cannot check that rule, because it cannot see that a listed identifier now carries another meaning. So the warning carries the rule.

**Fix:** check the spelling, or ignore the warning when the value is a custom format of your own.

### `nested-header-ignored`

> This @header marks a property that is not a top-level field of a @message model, so it stays in the payload schema. Only a top-level field is lifted into `headers`. Move the property to the message model, or describe the whole headers object with @headers.

`@header` marks a property the emitter cannot lift: it sits inside a model that a payload refers to, rather than on the message model itself. The payload of a message is one object, and its headers are a sibling of that object. A field two levels down has no such sibling to move to, and lifting it would silently restructure the payload around it. `@typespec/http` reads metadata off the top level for the same reason.

**Fix:** move the property to the message model, or describe the whole headers object with `@headers`.

### `inherited-header-ignored`

> This @header marks a property that '\<message\>' inherits through 'extends', so it stays in the payload schema. Only a property the message model declares itself is lifted into `headers`. Spread the base model with '...' instead of extending it, or describe the whole headers object with @headers.

`@header` marks a property that the message inherits through `extends`. Such a property is a top-level field of the emitted payload, so this case gets its own message rather than the one above.

A base model is a declaration of its own, shared by every model that extends it, and the payload refers to it through `allOf`. Lifting a field out of it would change every other user of that base model too. A spread, `...Base`, copies the properties into the message model instead, so those fields are the message's own and they are lifted.

**Fix:** spread the base model with `...`, or describe the whole headers object with `@headers`.

### `server-outside-service`

> Server '\<name\>' on namespace '\<namespace\>' was dropped. The emitter reads the servers of the service namespace only. Move this @server to the service namespace this document is emitted from.

`@server` is applied to a namespace that is not the service namespace this document comes from. The emitter reads servers from the service namespace only, the same source as `info`.

**Fix:** Move the `@server` to the service namespace, or use `@@server` to augment it from where you are.

### `multiple-services`

> Multiple services found. AsyncAPI only supports one service per document. The first one will be used.

More than one namespace carries `@service`. The emitter uses the first and ignores the rest.

**Fix:** keep one `@service` per compilation, or split services into separate `tsp compile` runs.

### `unserializable-example`

> This @example could not be serialized to JSON and was omitted from the emitted schema.

An `@example` value contains something the compiler cannot serialize to plain JSON (an unsupported scalar constructor, a malformed `duration.fromISO(...)` value, ...). The example is dropped; the schema itself is unaffected.

**Fix:** simplify the example value to JSON-representable parts.

### `inherited-header-overridden`

> The field '\<field\>' is lifted into the `headers` of message '\<base\>'. Message '\<message\>' extends '\<base\>' and describes its own headers with @headers or @rawHeaders, so the lift is cancelled and the field stays in the payload of '\<message\>'.

A base message lifts a field into its `headers` with `@header`. A derived message describes its own headers with [`@headers`](./decorators/messages#headers) or [`@rawHeaders`](./decorators/messages#rawheaders), which replaces the lift wholesale. The field then travels as a header of the base and as payload data of the derived message.

The emitter follows the derived message's own declaration. Both readings are defensible, so the conflict is reported rather than resolved silently.

**Fix:** add the field to the headers schema of the derived message, or drop that decorator so the derived message inherits the lift.

### `unserializable-message-example`

> This @messageExample could not be serialized to JSON and was dropped from the emitted message.

A `@messageExample` value contains something the compiler cannot serialize to plain JSON (an unsupported scalar constructor, a malformed `duration.fromISO(...)` value, ...). The whole entry is dropped, including its serializable sibling fields. An entry that kept half its payload would show a message the application never sends.

**Fix:** simplify the example value to JSON-representable parts.

### `extension-target-not-emitted`

> @extension sits on a target that emits no info, channel, operation, or message object, so it reaches no part of the document. Every @extension here was dropped. Move it to the service namespace, a channel, an operation, or a @message model.

[`@extension`](./decorators/document-info#extension) accepts any target, because AsyncAPI allows a specification extension on every object. The emitter writes one on four objects only: `info`, a channel, an operation, and a message. A target that emits none of them reaches no part of the document.

A server and a security scheme are two such targets. Both are declared with a named argument on a namespace, so one `@extension` cannot name which of them it means.

One target gets one report, however many keys it carries. The placement is the mistake, not each key.

**Fix:** move the application to the service namespace, a `@channel` interface, a `@send`/`@receive` operation, or a `@message` model.

### `unserializable-extension`

> The value of the extension key '\<key\>' could not be serialized to JSON, so this @extension was dropped. Give the key a value the emitter can write.

The value passed to [`@extension`](./decorators/document-info#extension) contains something the compiler cannot serialize to plain JSON, such as an unsupported scalar constructor. The whole application is dropped. A recorded value the writer cannot write would make the key disappear with nothing said about it.

Other applications on the same target are unaffected.

**Fix:** simplify the value to JSON-representable parts.

### `unserializable-default`

> This property's default value could not be serialized to JSON and was omitted from the emitted schema.

A property's default value, written as `name?: T = value`, contains something the compiler cannot serialize to plain JSON. The `default` keyword is omitted and the rest of the schema is unaffected. A half-serialized default would put a value in the schema that the schema itself rejects.

**Fix:** simplify the default value to JSON-representable parts.

### `visibility-not-applied`

> @visibility does not change an AsyncAPI message. A message has one shape, not a shape per lifecycle phase, so this property is emitted in full. Use @invisible to leave a property out of the document.

[`@visibility`](https://typespec.io/docs/language-basics/visibility/) gives one model several shapes, one per lifecycle phase. An AsyncAPI message has no phases: it is one shape, sent once. There is no phase for the emitter to select, and the property is emitted in full.

`@invisible(Lifecycle)` is different. It places the property in no phase at all, which needs no phase to interpret, so the emitter honours it and leaves the property out. Nothing is reported for that case.

**Fix:** use `@invisible(Lifecycle)` to keep a property out of the document, or remove the `@visibility` if the property does belong in the message.

### `unrepresentable-numeric-constraint`

> This @\<decorator\> constraint could not be represented as a JSON number (its value overflows or loses precision as a JS number) and was omitted from the emitted schema.

A `@minValue`/`@maxValue`/`@minLength`/... bound overflows or loses precision as a JavaScript number — e.g. `@maxValue(9223372036854775807)` on an `int64`. The keyword is omitted rather than emitted with a corrupted value.

**Fix:** use a bound that fits exactly in a double (up to ±2^53), or drop the constraint.

### `unsupported-temporal-range-constraint`

> This @\<decorator\> constraint targets a date/time/duration value, which draft-07 JSON Schema cannot express as a `minimum`/`maximum`, and was omitted from the emitted schema.

`@minValue`/`@maxValue` on a temporal scalar (`utcDateTime`, `plainDate`, `duration`, ...). Those emit as `type: string` schemas, and draft-07 has no keyword to bound a string-typed date.

**Fix:** remove the constraint, or express it as documentation (`@doc`).

### `encoding-describes-no-variant`

> @encode("\<encoding\>") describes none of the variants of this union, so the encoding was left out of the emitted schema. Each variant keeps the shape its own type states.

`@encode` on a union-typed property, where no variant is a type the encoding describes — e.g. `@encode("ISO8601") d: utcDateTime | null`. ISO 8601 names how a `duration` travels, and neither variant is a `duration`. The compiler accepts the decorator, so this is the only report the author gets.

**Fix:** use an encoding that names one of the variants, or change the property type to one the encoding describes.

### `missing-discriminator-property`

> @discriminator("\<property\>") names a property that is not defined on this model. AsyncAPI requires the discriminating property to be defined here, so `discriminator` was omitted from the emitted schema.

**Fix:** declare the named property on the model (or an ancestor), or fix the property name in `@discriminator`. Note it must be the **TypeSpec** property name, not an `@encodedName` wire name.

### `optional-discriminator-property`

> @discriminator("\<property\>") names a property that is optional on this model. AsyncAPI requires the discriminating property to be required, so `discriminator` was omitted from the emitted schema.

**Fix:** make the discriminating property required (remove the `?`).

### `encoded-name-override-conflict`

An overriding property's `@encodedName` differs from the same-named ancestor property's wire name. The usual `allOf: [$ref Base, own]` shape would then require **both** wire names at once, rejecting every valid payload. The emitter flattens the model's schema instead (inherited properties inlined, no `$ref` to the base).

**Fix:** give the override the same `@encodedName` as the ancestor's, or rename at one level only.

### `never-typed-property-override`

A property is declared `never` to remove an inherited property, but the base's `$ref` branch would still require it. As above, the emitter flattens the schema (with the `never`-typed property omitted).

**Fix:** none needed if flattening is acceptable — this warning documents the shape change. Otherwise restructure the hierarchy so the property isn't inherited in the first place.

### `binding-outside-document`

> A '\<protocol\>' binding for the \<level\> level sits on a target that emits no such object, so it reaches no part of the document. This binding was dropped. Add the decorator that emits the object: @channel or @dynamicChannel for a channel, @send or @receive for an operation, @message for a message, and @server on the service namespace for a server.

A binding sits on the object its target emits. A target that emits no object carries a binding that changes nothing.

`@binding` names no level, so it reports a second wording. That message names all four objects rather than one level.

**Fix:** add the decorator that emits the object, or remove the binding.

### `invalid-binding-field`

> The \<protocol\> binding field '\<field\>' expects \<expected\>. The value given here is outside that, so the field was dropped and the rest of the binding was kept.

One field carries a value the binding specification forbids. The Kafka binding reports it for `partitions`, `replicas`, `topicConfiguration`, `cleanup.policy`, `schemaIdLocation`, `key`, `groupId`, and `clientId`. The JMS server binding reports it for a `properties` entry that is not an object with a `name` and a `value`.

`topicConfiguration` reports it when the serializer cannot represent a member of the map. A custom scalar with an `init` is one such member. That member fails the whole map, so the report names `topicConfiguration` rather than the member.

The rest of the binding is emitted. A field the emitter cannot write the binding without costs more. It reports [`invalid-required-binding-field`](#invalid-required-binding-field) instead.

**Fix:** give the field a value the message names.

### `conflicting-message-schema-source`

> This message carries a payload written with @rawPayload, and the preview feature '\<provider\>' generated one for it too. The authored schema is the explicit statement of the two, so the document carries it and the generated one was dropped. Remove @rawPayload from this model, or turn '\<provider\>' off in `preview-features` in `tspconfig.yaml`.

A model carries `@rawPayload` and a [preview feature](./emitter-options#preview-features) generated a payload schema for it as well.

The authored schema wins. It is the explicit statement of the two, and a generated schema that replaced it would leave the author's own text out of the document.

**Fix:** remove `@rawPayload` from the model to take the generated schema, or remove the feature from `preview-features` to keep writing the payload by hand.
