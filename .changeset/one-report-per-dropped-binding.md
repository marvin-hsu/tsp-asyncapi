---
"tsp-asyncapi-core": patch
"tsp-asyncapi": patch
---

Report a dropped binding once, and state a reason that holds at every site.

A `persistence` outside the two values Pulsar defines reported three times. It
reported `invalid-binding-field`, which says the rest of the binding was kept.
It then reported `missing-binding-field`, which says the binding does not give
a field the author had given. The binding was dropped after both. The field
now reports `invalid-required-binding-field` alone, which is the code that
says what happens.

The message of `invalid-required-binding-field` said AsyncAPI requires the
field. That is not true at every site. The `deadLetterQueue` of an
`@sqsChannel` is optional, and a rejected value there still costs the binding.
The message now says the binding cannot be written without the field.

An `@sqsOperation` read every entry of its `queues` list before it dropped the
binding on the first bad entry. A field of a later entry was then reported as
kept, beside the error that dropped the whole binding. The decorator now stops
at the first entry it refuses.
