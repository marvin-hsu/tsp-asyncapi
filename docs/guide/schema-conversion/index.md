---
title: "Schema Conversion"
description: "How the emitter turns each TypeSpec construct into an AsyncAPI Schema Object, one page per construct."
---

# Schema Conversion

How the emitter converts each TypeSpec construct to an [AsyncAPI Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#schemaObject) (a superset of JSON Schema draft-07). A construct used as a message payload lands in `components.schemas`.
