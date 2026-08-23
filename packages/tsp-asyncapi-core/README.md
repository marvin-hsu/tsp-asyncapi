# tsp-asyncapi-core

The decorators and the semantic model behind [`tsp-asyncapi`][emitter].

This package declares the input language. It emits nothing: it registers no
`$onEmit`, and it writes no file. That is the same shape `@typespec/http` uses.

## You probably do not need this package

To emit an AsyncAPI document, install [`tsp-asyncapi`][emitter] instead. It
depends on this package and forwards every decorator, so a `.tsp` file writes
`import "tsp-asyncapi";` and gets all of them.

```bash
npm install tsp-asyncapi
```

Install this package directly for one of two reasons:

- You are writing a tool that reads what an author declared, without emitting a
  document. Every reader for decorator state is exported here.
- You are writing another emitter for the same input language.

## What it holds

| Part              | What it is                                                  |
| ----------------- | ----------------------------------------------------------- |
| `lib/main.tsp`    | All 56 `extern dec` declarations and the models they accept |
| Decorators        | The implementations, which record state on the program      |
| The resolve stage | Turns the program plus that state into one semantic model   |
| Diagnostics       | All 103 codes, including the ones an emitter reports        |

## The library name is not the package name

This library registers with the TypeSpec compiler as `tsp-asyncapi`, not as
`tsp-asyncapi-core`. The name is the prefix of every diagnostic code, and those
codes are documented and depended on. Splitting the emitter into two packages
was not a reason to rename them.

Use `LIBRARY_NAME` for that registered name. Use `PACKAGE_NAME` where a package
has to be named, such as when asking the compiler to load this library.

## Stability

The exported names include the semantic model and the utilities an emitter
needs. They are a public promise, and this package is `0.x`, so a minor release
may change them. The document you get from `tsp-asyncapi` is unaffected.

## Documentation

The guide and the reference cover both packages: <https://marvin-hsu.github.io/tsp-asyncapi/>

Traditional Chinese: [README.zh-TW.md](./README.zh-TW.md)

## License

MIT

[emitter]: https://www.npmjs.com/package/tsp-asyncapi
