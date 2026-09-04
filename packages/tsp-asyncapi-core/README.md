# tsp-asyncapi-core

[![npm](https://img.shields.io/npm/v/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core)
[![downloads](https://img.shields.io/npm/dm/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core)
[![Node.js](https://img.shields.io/node/v/tsp-asyncapi-core)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The decorators and the semantic model behind
[`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi). It emits nothing
itself.

> **Note:** To emit an AsyncAPI document, use
> [`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi) instead. It brings
> every decorator here with it, and a `.tsp` file only needs
> `import "tsp-asyncapi";`.
>
> Still `0.x`, so a minor release may change the exported names. The document
> `tsp-asyncapi` produces is unaffected.

## When you want this package directly

- You are building a tool that reads what an author declared and emits nothing.
  Every decorator state reader is exported from here.
- You are writing a second emitter for the same input language. The resolve
  stage turns the program and the decorator state into a semantic model you can
  pick up from.

```bash
npm install tsp-asyncapi-core
```

## More

- [Documentation](https://tsp-asyncapi.marvinhsu.dev/)
- [GitHub repository](https://github.com/marvin-hsu/tsp-asyncapi)

Traditional Chinese: [README.zh-TW.md](./README.zh-TW.md)

## License

MIT
