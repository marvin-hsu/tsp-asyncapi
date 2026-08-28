# Changelog

## 0.3.1

### Patch Changes

- Show decorator documentation on hover in the TypeSpec editor.

  The language service reads `/** */` on declarations in `lib/main.tsp`. It
  ignores TypeScript JSDoc, and it ignores `//` comments next to `extern dec`.
  Every decorator now has a doc comment, with `@param` on each argument, so
  hovering `@server` or `@avroRecord` shows what the decorator takes.

  Comments in the TypeScript sources follow the same short-sentence style.
  Behaviour is unchanged.

## 0.3.0

### Minor Changes

- 00dc835: Read `@Avro.logicalType`, `@Avro.fixed` and `@Avro.aliases` along the chain a
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

  The `tsp-avro` peer range of `tsp-asyncapi` moves to `0.3.x`, and the Avro
  payloads guide names that range. The library is not at 1.0, so its supported
  range follows its releases.

## 0.2.0

### Minor Changes

- 16aa769: Rename the two decorators whose names TypeSpec reserves.

  `` @Avro.`namespace` `` becomes `@Avro.avroNamespace`, and `` @Avro.`record` ``
  becomes `@Avro.avroRecord`. Neither name needs backticks any more.

  This is a breaking change. Replace both names in every source file. The other
  six decorators are unchanged, because none of their names is a reserved word.

  This library still depends on nothing but the compiler. A model that mixes
  `@AsyncAPI.header` with `@Avro.avroRecord` is refused by `tsp-asyncapi`, which
  owns both the decorator and the rule, and this library needs to know nothing
  about it.

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
