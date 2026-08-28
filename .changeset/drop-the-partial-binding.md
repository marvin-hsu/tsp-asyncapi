---
"tsp-asyncapi-core": minor
"tsp-asyncapi": minor
---

Drop the whole binding where a required binding field is rejected, and drop a
nested binding object that has no field left in it.

Three sites reported an error and then emitted the binding anyway: the
`deadLetterQueue` of an `@sqsChannel`, one entry of the `queues` of an
`@sqsOperation`, and the `schema` of a `@googlePubSubMessage`. The build failed
on the error while a document came out beside it, and that document was short
of a queue or a schema the author had declared. Each of the three now drops the
binding, which is what the message of `missing-binding-field` already said.

The new `invalid-required-binding-field` error covers the other half of the
same rule. `invalid-binding-field` is a warning that keeps the rest of the
binding, and it stays that way. A rejected value on a field the binding cannot
be written without costs the whole binding, so it reports the new code instead.
The `queue` of an SQS channel, the `queues` of an SQS operation and the
`schemaSettings` of a Google Cloud Pub/Sub channel report it.

An empty nested object is now dropped in the two bindings that emitted one.
`redrivePolicy`, `policy` and `tags` of an SQS queue emitted `{}`, and so did a
Solace `destinations` entry whose only field was rejected. An empty object
states nothing, an absent field states the same, and every other binding
already dropped it. A `destinations` list left with no entry is dropped as
well.

`@kafkaChannel` no longer crashes the compiler on a `topicConfiguration` the
serializer cannot represent. A custom scalar with an `init` inside that object
raised a `TypeError` out of the decorator. The field now goes through the
shared object check, so the value is reported and dropped and the rest of the
Kafka binding is kept.

A project that wrote one of these bindings incompletely gets the same errors it
got before, and the emitted document no longer carries the partial binding.
