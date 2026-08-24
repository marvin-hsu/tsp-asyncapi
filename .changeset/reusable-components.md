---
"tsp-asyncapi": minor
"tsp-asyncapi-core": minor
---

Share reusable fragments through `components`

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
