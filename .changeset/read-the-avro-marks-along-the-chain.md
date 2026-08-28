---
"tsp-avro": minor
---

Read `@Avro.logicalType`, `@Avro.fixed` and `@Avro.aliases` along the chain a
scalar extends, and refuse four sources that were written out wrong.

A TypeSpec scalar carries what it extends, and the primitive table already
matched through that chain. The three marks did not. `scalar CreatedAt extends
Ts` wrote a bare `long`, and `scalar Digest extends Md5` wrote a bare `bytes`.
The type on the wire was right and the meaning was gone, with no diagnostic.
Each mark now reads the nearest declaration in the chain. The nearest one wins,
so write the decorator again to say something else.

`@Avro.aliases` targets a scalar. `@Avro.fixed` makes a named Avro type of a
scalar, and a named type is what an alias stands for. A fixed model already
took one and a fixed scalar could not, while the walk read the aliases of both.

Four sources are refused that were written out before.

A named type may not take the name of an Avro primitive. Avro spells a
primitive by name alone, so `model int` was written into a schema that a reader
reads back as the primitive. The eight primitive names are reserved: `null`,
`boolean`, `int`, `long`, `float`, `double`, `bytes` and `string`. The six
complex keywords are free, because Avro spells a complex type as an object.
This reports `invalid-name`.

A scalar that carries `@Avro.fixed` extends `bytes`. An Avro fixed type is a
width of bytes, and `@Avro.fixed(4) scalar F extends string` was written out as
a fixed type all the same. A scalar that extends nothing is still written as
the fixed type, because it says nothing else. This reports `invalid-fixed`.

`@Avro.aliases` on a scalar written as an Avro primitive is refused. An alias
stands for a name, and a primitive has none. This reports the new
`aliases-target`.

A union that holds no branch is refused. `union Nothing {}` was written out as
`"type": []`. An Avro union is a list a reader picks one branch from, and an
empty list leaves nothing to pick. This reports `unsupported-type`.

A record or an array default is carried on an optional field. `x?: Inner = #{
a: "z" }` was refused for belonging to no branch of its union. The value names
no branch of its own, and `["null", Inner]` leaves one place for it to sit. The
refusal now stands only where more than one branch could carry the default. The
default is serialized against the branch it sits in, rather than against the
whole union. A union handed to the compiler has no form there, and the answer
was `{}`, so the field carried a default no reader can use.

A union of one branch is folded where the union is built. A field already wrote
such a union as the type itself. The items of an array and the values of a map
did not, so `U[]` came out as `["string"]` and put a union index on the wire
that no reader needed.

A refusal that is about a decorator on a scalar points at the scalar
declaration. `aliases-target` and the `underlying` form of `invalid-fixed`
pointed at the field that used the scalar, so an editor drew the error on code
the author cannot fix. Each is reported once per declaration now, rather than
once per field.

An empty Avro namespace is joined as no namespace. The split of a full name
hands back the empty namespace for a name that carries none, and the join read
that as a namespace and wrote `".Event"`.

The message of `unsupported-type` for a scalar names what to write instead.
Avro has eight primitive types, and `utcDateTime`, `offsetDateTime`,
`plainDate`, `plainTime`, `duration` and `decimal` are none of them. The
message says to declare the field as a type Avro carries, and to write the
meaning with `@Avro.logicalType`.

A build can fail where it succeeded before. Every diagnostic of this package is
an error. A project that named a record, an enum or a fixed type after an Avro
primitive built before this release. So did one that wrote `@Avro.fixed` on a
scalar extending an Avro type other than `bytes`, one that wrote
`@Avro.aliases` on a scalar written as a primitive, and one that declared a
union with no branch. Each of those four wrote a schema that says something
other than the source does.
