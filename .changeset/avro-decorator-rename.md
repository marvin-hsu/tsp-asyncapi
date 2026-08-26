---
"tsp-avro": minor
---

Rename the two decorators whose names TypeSpec reserves.

`` @Avro.`namespace` `` becomes `@Avro.avroNamespace`, and `` @Avro.`record` ``
becomes `@Avro.avroRecord`. Neither name needs backticks any more.

This is a breaking change. Replace both names in every source file. The other
six decorators are unchanged, because none of their names is a reserved word.

`buildAvroRecordWithDiagnostics` takes an optional third argument, a set of
properties to leave out of the record. A caller that passes none gets every
property, as before.
