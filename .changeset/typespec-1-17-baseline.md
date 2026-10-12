---
"tsp-asyncapi-core": minor
"tsp-asyncapi": minor
"tsp-avro": minor
---

Require TypeSpec compiler `^1.17.0` and Node.js 22 or later.

The protobuf preview now supports `@typespec/protobuf` `0.87.x`. Install it
with the matching compiler. The optional Avro peer moves to `tsp-avro`
`0.4.x`, the release that carries the same compiler range. The compiler from 1.15 already requires Node.js
22, so the `engines` field now states the same floor.

Compiler 1.15.0 lets a crafted version value write files outside the output
directory (GHSA-2q42-4q24-7rgv). This baseline also moves `fast-uri` to a
release past its reported advisories.

A server variable or an object member named `__proto__` is now kept. The
compiler from 1.16 passes such a member through to the decorator. A plain
assignment of that name writes the prototype instead of a member. So the
variable was dropped in silence, and a nested object became readable as
inherited fields. Both places now build the object from entries, and the
name becomes an ordinary own key.
