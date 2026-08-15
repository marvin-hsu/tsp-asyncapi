# Diagnostics

Every warning and error this emitter can report, with what causes it and how to fix it. Diagnostic codes appear in compiler output as `tsp-asyncapi/<code>`.

A common design principle across all of them: **the emitter never silently drops or silently rewrites your intent.** Anything it cannot represent is either omitted with a warning, or reported as an error.

## Errors

### `duplicate-schema-key`

> Duplicate schema name: '\<name\>'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.

Two declarations resolved to the same `components.schemas` key. Typical causes: two `@friendlyName`s resolving to the same string, or a declared model whose name matches a template instantiation's derived name (e.g. declaring `model PageString` while also using `Page<string>`).

**Fix:** rename one declaration, or give one of them a distinct `@friendlyName`. The emitter never renames either side automatically.

### `unsupported-payload-type`

> This emitter does not support a \<kind\> here. Use a model, scalar, enum, union, or literal value instead.

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

An application of [`@contentType`](./decorators#contenttype) passed the empty string. A blank media type names no format, so the emitter cannot write it into the message.

The message falls back to the document `defaultContentType`, the same result an absent `@contentType` gives. The user typed the empty string on purpose, so that fallback is reported rather than silent.

**Fix:** give the decorator a media type, such as `application/json`, or remove it.

### `duplicate-headers-decorator`

> @headers is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @headers.

`@headers` is not repeatable. Stacking it silently keeps just one application, so the other headers models never reach the document.

**Fix:** remove the extra `@headers`.

### `duplicate-message-headers`

> This message takes its headers from two sources: a field marked @header, and a model given to @headers. There is no rule that picks one over the other, so no `headers` were emitted at all. Keep one of the two sources.

A message declares headers twice: at least one field carries `@header`, and the model also carries `@headers`. The emitter defines no priority between the two, so it emits neither. The marked fields stay in the payload, so nothing you wrote disappears while the error is unresolved.

**Fix:** keep one source. Move the marked fields into the `@headers` model, or drop the `@headers`.

### `headers-not-object`

> The model '\<name\>' given to @headers is backed by an array. AsyncAPI requires the headers schema to be a key/value map, so no `headers` were emitted. Pass a model with properties instead.

The model given to `@headers` emits `type: "array"` — it `is` an array, or it extends one. AsyncAPI requires the `headers` schema to describe a key/value map.

**Fix:** pass a model with properties, or a `Record<T>`-backed model. Both emit an object schema.

### `content-type-header-conflict`

> The header '\<name\>' names the message content type, and this message also carries @contentType. AsyncAPI has one field for the content type, so two sources for it are ambiguous. Remove the @header field and keep @contentType.

A header field is named `content-type` (the comparison uses the emitted wire name and ignores case), and the same message also carries `@contentType`. AsyncAPI keeps the content type in its own message field, so the two sources cannot both be honoured. `@typespec/http` reclassifies such a header because HTTP has no other way to state it; this emitter does have `@contentType`, so it reports instead of choosing.

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

An application of [`@asyncTag`](./decorators#asynctag) passed the empty string as the tag name. `name` is required on an AsyncAPI Tag Object, so a blank one names nothing a consumer can match.

**Fix:** give the tag a name.

### `conflicting-tag-metadata`

> Tag '\<name\>' is declared more than once here, with a different '\<field\>'. AsyncAPI emits one Tag Object per name on an object, so only one of the two values can be kept. The first one in source order was kept. Merge the @asyncTag applications into one, or give them different names.

Two applications of [`@asyncTag`](./decorators#asynctag) on one target name the same tag and give one of its fields two different values. AsyncAPI emits one Tag Object per name on an object, so one of the two values would have to be dropped. The emitter reports the ambiguity rather than choosing silently.

Applications that set _different_ fields merge instead, and so do a built-in `@tag` and an `@asyncTag` of the same name. The same name on two _different_ targets is never a conflict: AsyncAPI gives every object its own independent `tags` array.

**Fix:** merge the two applications into one, or give them different names.

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

## Warnings

### `message-key-shadows-schema-key`

> Message name '\<name\>' is also the components.schemas key of a different type, so a reader can misread this message as describing that type. A message key drops the namespace prefix that a schema key keeps, which makes the two overlap. Pass a different name to @message.

The document stays valid — `components.messages` and `components.schemas` are separate maps, so nothing actually collides. The risk is to the reader: `components.messages.Sales.Ev` and `components.schemas["Sales.Ev"]` look like the same thing while describing different types.

**Fix:** pass a different name to `@message`.

### `sanitized-message-key`

> Message name '\<requested\>' is not a legal components.messages key, so it was emitted as '\<emitted\>'. A key may only use the characters a-z, A-Z, 0-9, '.', '-', and '_'.

The name given to `@message` falls outside the Components Object key charset, so the emitter encoded the offending characters. The emitted key is therefore not the string that was asked for.

**Fix:** pass a name that only uses `a-z`, `A-Z`, `0-9`, `.`, `-`, and `_`.

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

> Server '\<name\>' on namespace '\<namespace\>' was dropped. This emitter reads the servers of the service namespace only. Move this @server to the service namespace this document is emitted from.

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

### `unserializable-message-example`

> This @messageExample could not be serialized to JSON and was dropped from the emitted message.

A `@messageExample` value contains something the compiler cannot serialize to plain JSON (an unsupported scalar constructor, a malformed `duration.fromISO(...)` value, ...). The whole entry is dropped, including its serializable sibling fields. An entry that kept half its payload would show a message the application never sends.

**Fix:** simplify the example value to JSON-representable parts.

### `unrepresentable-numeric-constraint`

> This @\<decorator\> constraint could not be represented as a JSON number (its value overflows or loses precision as a JS number) and was omitted from the emitted schema.

A `@minValue`/`@maxValue`/`@minLength`/... bound overflows or loses precision as a JavaScript number — e.g. `@maxValue(9223372036854775807)` on an `int64`. The keyword is omitted rather than emitted with a corrupted value.

**Fix:** use a bound that fits exactly in a double (up to ±2^53), or drop the constraint.

### `unsupported-temporal-range-constraint`

> This @\<decorator\> constraint targets a date/time/duration value, which draft-07 JSON Schema cannot express as a `minimum`/`maximum`, and was omitted from the emitted schema.

`@minValue`/`@maxValue` on a temporal scalar (`utcDateTime`, `plainDate`, `duration`, ...). Those emit as `type: string` schemas, and draft-07 has no keyword to bound a string-typed date.

**Fix:** remove the constraint, or express it as documentation (`@doc`).

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
