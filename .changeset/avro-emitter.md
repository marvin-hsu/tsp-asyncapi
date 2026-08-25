---
"tsp-avro": minor
---

Add `tsp-avro`, an experimental TypeSpec library and emitter for Apache Avro

This package is new, and it is experimental. It is pre-1.0. Its decorators,
its output and its diagnostics may change in any release. Pin an exact version
if you depend on it.

It is the Avro counterpart of `@typespec/protobuf`, not an AsyncAPI package. It
declares its own decorators, registers its own `$onEmit`, and writes `.avsc`
files. It needs no AsyncAPI decorator, and it changes nothing in `tsp-asyncapi`
or `tsp-asyncapi-core`.

A model marked with ``@Avro.`record` `` becomes one `.avsc` file, written under
the path its Avro namespace names. Avro has no import, so each file holds every
named type that record reaches. A named type is written in full at its first
occurrence and by name after that, which is also how a record that reaches
itself terminates.

Seven more decorators cover what Avro has and TypeSpec cannot say:
``@Avro.`namespace` ``, `@Avro.aliases`, `@Avro.order`, `@Avro.fixed`,
`@Avro.logicalType`, `@Avro.decimal`, and `@Avro.enumDefault`. Documentation
comes from the native `/** */` comment, and a field default from the native
`= value`.

Optionality is a union with null. Avro reads a default against the first branch
of a union alone, so `x?: string` leads with null and `x?: string = "a"` leads
with the string.

A construct Avro cannot carry is refused rather than translated. Inheritance,
an anonymous model, a template instance, an unsigned integer, and a union that
names one type twice are each reported. Every diagnostic is an error, and an
error stops every write, so one compile writes the schemas asked for or writes
none.
