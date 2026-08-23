# Changelog

This package follows [semantic versioning](https://semver.org/). It is still in
`0.x`, so a minor release may carry a breaking change. Any that does says so at
the top of its entry.

The Traditional Chinese version is [CHANGELOG.zh-TW.md](./CHANGELOG.zh-TW.md).

## 0.1.1

Exports `PACKAGE_NAME`. It was defined here and used by the test host, and both
the README and the 0.1.0 entry described it, but `index.ts` never exported it.
Anything outside this package that followed the documentation got `undefined`.

Nothing else changes. `LIBRARY_NAME` still holds the name this library
registers with the compiler, which is `tsp-asyncapi`; `PACKAGE_NAME` holds this
package's own name.

## 0.1.0

First release. This package is the decorator half of `tsp-asyncapi`, separated
out so that more than one emitter can share one input language.

It versions independently of any emitter. `tsp-asyncapi` depends on it with a
`~` range, so a minor release here does not reach an emitter until that emitter
takes it. The two started at different numbers for that reason: this package is
new, and `0.1.0` says so.

What it exports:

- The 56 decorators, declared in `lib/main.tsp` and implemented here.
- A reader for each kind of decorator state: 24 functions and 51 types.
- `$lib` with all 103 diagnostics, `reportDiagnostic`, `createDiagnostic`,
  `LIBRARY_NAME`, and `PACKAGE_NAME`.
- Spec-derived constants, and the naming and serialization helpers an emitter
  needs.
- The document object types an author writes directly, under `./types`. That
  covers every protocol binding object, security schemes, tags, and examples.
- The semantic model, under `./unstable`. Its shape is expected to change, and
  the entry point name is the warning.
- A test host, under `./testing`, that loads the decorators alone.

Two notes on the boundary:

- `LIBRARY_NAME` is `tsp-asyncapi`, not this package's name. It is the prefix of
  every diagnostic code, and those codes were not renamed when the emitter was
  split in two.
- Everything in the main entry point is a semver promise, including the
  constants and the helpers. Only `./unstable` is exempt.
