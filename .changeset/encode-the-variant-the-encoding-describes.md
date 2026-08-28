---
"tsp-asyncapi-core": minor
"tsp-asyncapi": minor
---

Apply `@encode` to the union variants the encoding describes, and keep one
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
