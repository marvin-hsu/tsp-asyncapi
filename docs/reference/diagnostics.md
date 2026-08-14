# Diagnostics

Every warning and error this emitter can report, with what causes it and how to fix it. Diagnostic codes appear in compiler output as `typespec-asyncapi/<code>`.

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

## Warnings

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
