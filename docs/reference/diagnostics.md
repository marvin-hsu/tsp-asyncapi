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
