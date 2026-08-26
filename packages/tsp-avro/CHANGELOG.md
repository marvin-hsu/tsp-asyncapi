# Changelog

## 0.1.0

The first release. `tsp-avro` is a TypeSpec library and emitter for Apache
Avro. It writes one `.avsc` file per record, under the directory its Avro
namespace names.

A plain TypeSpec model is already a valid Avro record, because Avro asks for no
field numbers. The decorators cover what Avro has and TypeSpec cannot say:

- `` @`namespace` `` on a namespace, and `` @`record` `` on a model. Both names
  are reserved words in TypeSpec, so both are written in backticks.
- `@aliases`, `@order`, `@fixed`, `@logicalType`, `@decimal` and `@enumDefault`.

Documentation comes from `/** */` and a field default from the language's own
`= value`.

Each file stands on its own, because Avro has no import. A named type is
written in full where it first appears and by name after that, which is also
how a type that reaches itself terminates.

A construct Avro cannot carry is refused with a diagnostic, and no file is
written for that record. Refusing covers a scalar outside the table, a union
that repeats a branch, a template instantiation, an anonymous model, a name
that is not a legal Avro name, and a logical type on an underlying type the
specification does not allow.

This package is experimental. It is pre-1.0, and its decorators, its output and
its diagnostics may change in any release.

This entry is written by hand, because the release it describes is the one that
created the package. Every entry above it is generated from a changeset.
