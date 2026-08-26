---
"tsp-avro": minor
---

Rename the two decorators whose names TypeSpec reserves.

`` @Avro.`namespace` `` becomes `@Avro.avroNamespace`, and `` @Avro.`record` ``
becomes `@Avro.avroRecord`. Neither name needs backticks any more.

This is a breaking change. Replace both names in every source file. The other
six decorators are unchanged, because none of their names is a reserved word.

This library still depends on nothing but the compiler. A model that mixes
`@AsyncAPI.header` with `@Avro.avroRecord` is refused by `tsp-asyncapi`, which
owns both the decorator and the rule, and this library needs to know nothing
about it.
