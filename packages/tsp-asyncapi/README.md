# tsp-asyncapi

Compiles TypeSpec into an AsyncAPI 3.1 document.

```bash
npm install tsp-asyncapi
```

```yaml
# tspconfig.yaml
emit:
  - "tsp-asyncapi"
```

```typespec
import "tsp-asyncapi";

using AsyncAPI;
```

The decorators come from [`tsp-asyncapi-core`][core], which this package
depends on. Installing this one is enough, and one import brings in every
decorator.

## What it holds

| Part               | What it is                                             |
| ------------------ | ------------------------------------------------------ |
| The lower stage    | Turns the semantic model into the AsyncAPI object tree |
| The document types | The TypeScript shape of every emitted object           |
| `$onEmit`          | Writes the document as YAML or JSON                    |

## Emitter options

Five, all optional: `output-file`, `file-type`, `asyncapi-id`,
`default-content-type`, and `preview-features`. The [reference][options]
describes each one.

## Documentation

Guide, decorator reference, binding reference, and every diagnostic code:
<https://marvin-hsu.github.io/tsp-asyncapi/>

The repository README carries the full feature matrix and the list of gaps,
including what this emitter will not do.

Traditional Chinese: [README.zh-TW.md](./README.zh-TW.md)

## License

MIT

[core]: https://www.npmjs.com/package/tsp-asyncapi-core
[options]: https://marvin-hsu.github.io/tsp-asyncapi/reference/emitter-options
