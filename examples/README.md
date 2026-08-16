# Examples

Eight worked examples of `tsp-asyncapi`. Each one is a complete, compiling
TypeSpec project. Each one carries the AsyncAPI document it produces.

Every example has three or four files.

| File             | What it is                                        |
| ---------------- | ------------------------------------------------- |
| `main.tsp`       | the TypeSpec source, with comments on each step   |
| `tspconfig.yaml` | the emitter configuration                         |
| `README.md`      | what the example shows, and why                   |
| `asyncapi.yaml`  | the emitted document, committed to the repository |

`asyncapi.yaml` is committed on purpose. You can read the output of an
example without installing anything. A change to the source then shows up as
a diff on the output.

## Read them in order

Each example builds on the one before it.

| #                                                         | Shows                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| [01-hello-world](01-hello-world/)                         | the smallest complete document, one `@send`, how to run it   |
| [02-payload-schemas](02-payload-schemas/)                 | models, enums, scalars, constraints, formats, wire names     |
| [03-schema-composition](03-schema-composition/)           | inheritance, discriminators, unions, templates, extensions   |
| [04-message-metadata](04-message-metadata/)               | headers, content type, correlation id, examples, two `@send` |
| [05-channels-and-parameters](05-channels-and-parameters/) | addresses, address parameters, channel ids, `@receive`       |
| [06-servers-and-security](06-servers-and-security/)       | servers, server variables, security schemes, tags            |
| [07-request-and-reply](07-request-and-reply/)             | the `reply` object, reply channels, reply addresses          |
| [08-kafka-user-signup](08-kafka-user-signup/)             | one realistic Kafka contract that combines all of the above  |

Start at 01 even if you already know TypeSpec. It explains how a channel
finds its messages, and that rule holds in every later example.

Copy [08-kafka-user-signup](08-kafka-user-signup/) when you start a contract
of your own.

## Compile one

Build the emitter first. Both steps run once, from the root of the
repository.

```bash
pnpm install
pnpm build
```

`lib/main.tsp` imports `../dist/src/tsp-index.js`, and `dist/` is not in the
repository. Every example imports the emitter, so no example compiles before
a build. Skip the build and the compiler reports `import-not-found` for that
path, then one `missing-implementation` per decorator. The last line of that
output says no emitter was configured. It is misleading. The emitter is
configured. It is not built.

Then compile an example.

```bash
cd examples/01-hello-world
tsp compile .
```

The document is written to `asyncapi.yaml` in that same directory. Every
`tspconfig.yaml` here sets `emitter-output-dir: "{project-root}"` to put it
there. Without that option the compiler writes it two levels down, to
`tsp-output/tsp-asyncapi/asyncapi.yaml`.

If `tsp` is not on your path, call the binary in this repository:

```bash
cd examples/01-hello-world
../../node_modules/.bin/tsp compile .
```

Each `main.tsp` starts with `import "../..";`, which points at the root of
this repository. In a project of your own, depend on the package and write
`import "tsp-asyncapi";` instead.

## What the examples do not cover

**Protocol bindings.** AsyncAPI puts protocol detail in a `bindings` object
on a server, a channel, an operation, or a message. Kafka partition keys,
AMQP exchange settings, and MQTT quality of service all live there. This
emitter has no binding decorator of any kind. Add bindings by hand to the
emitted document.
