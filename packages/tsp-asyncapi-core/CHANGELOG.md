# Changelog

This package follows [semantic versioning](https://semver.org/). It is still in
`0.x`, so a minor release may carry a breaking change. Any that does says so at
the top of its entry.

The Traditional Chinese version is [CHANGELOG.zh-TW.md](./CHANGELOG.zh-TW.md).

## 0.4.0

First release. This package is the decorator half of `tsp-asyncapi`, separated
out so that more than one emitter can share one input language.

It starts at `0.4.0` rather than `0.1.0`, to match the emitter it was separated
from. The two are released together and depend on each other by workspace
protocol, so two version numbers moving apart would only confuse. They can
diverge once a second emitter has its own release rhythm.

What it exports:

- The 56 decorators, declared in `lib/main.tsp` and implemented here.
- A reader for each kind of decorator state: 24 functions and 51 types.
- `resolveService`, which produces the semantic model, and the types of every
  node in it.
- `$lib` with all 103 diagnostics, `reportDiagnostic`, `createDiagnostic`,
  `LIBRARY_NAME`, and `PACKAGE_NAME`.
- The document object types an author writes directly, under `./types`. That
  covers every protocol binding object, security schemes, tags, and examples.
- A test host, under `./testing`, that loads the decorators alone.

Two notes on the boundary:

- `LIBRARY_NAME` is `tsp-asyncapi`, not this package's name. It is the prefix of
  every diagnostic code, and those codes were not renamed.
- The semantic model and the shared utilities are exported because an emitter in
  another package needs them. They are a public promise now, and a minor release
  may change them.
