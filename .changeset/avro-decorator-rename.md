---
"tsp-avro": minor
---

Rename the two decorators whose names TypeSpec reserves.

`` @Avro.`namespace` `` becomes `@Avro.avroNamespace`, and `` @Avro.`record` ``
becomes `@Avro.avroRecord`. Neither name needs backticks any more.

This is a breaking change. Replace both names in every source file. The other
six decorators are unchanged, because none of their names is a reserved word.

A property marked with `@AsyncAPI.header` is left out of the record. A header
travels beside the message rather than inside it, so a record that declared it
would describe a field the message does not carry there. Nothing is reported:
the record without the header is the record the author asked for. The mark is
read through the global symbol registry, so this library still depends on
nothing but the compiler, and a project that writes no AsyncAPI decorator is
unaffected.

Only the record the walk was asked for is read. A mark on a model reached from
it is on something that is not a message, so that property stays.
