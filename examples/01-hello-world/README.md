# 01 — Hello world

The smallest complete document this emitter can produce. Read this one first.

## What it shows

- One service namespace with `@service` and `@info`.
- One payload model marked with `@message`.
- One channel declared with `@channel` on an interface.
- How a channel finds its messages.
- The `tspconfig.yaml` that every other example in this directory reuses.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, and `dist/` is not in the repository. Each `main.tsp` imports the
emitter, so no example compiles before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/01-hello-world
tsp compile .
```

Skip the build and the compiler reports `import-not-found` for
`../dist/src/tsp-index.js`, followed by one `missing-implementation` per
decorator. The last line of that output says no emitter was configured. It is
misleading. The emitter is configured. It is not built.

The document lands in `asyncapi.yaml`, beside `main.tsp`. The
`emitter-output-dir` option in `tspconfig.yaml` puts it there. Without that
option the compiler writes it to `tsp-output/tsp-asyncapi/asyncapi.yaml`.

Every example carries its emitted document in the repository. You can read the
output of an example without running anything.

The `tsp` binary in this repository is `node_modules/.bin/tsp`. If `tsp` is
not on your path, call it by that path.

## Where each field comes from

| Emitted field                | Source                                        |
| ---------------------------- | --------------------------------------------- |
| `id`                         | the `asyncapi-id` emitter option              |
| `info.title`                 | `@service(#{ title: ... })`                   |
| `info.version`               | `@info(#{ version: ... })`                    |
| `info.description`           | `@info(#{ description: ... })`                |
| `defaultContentType`         | the `default-content-type` emitter option     |
| `channels.Greetings`         | `@channel` on `interface Greetings`           |
| `channels.Greetings.address` | the first argument of `@channel`              |
| `components.messages`        | one entry per `@message` model                |
| `components.schemas`         | one entry per model a message payload reaches |

## How a channel finds its messages

A channel owns the operations declared directly inside its interface. The
emitter reads the parameters and the return type of each of those operations.
Every model marked `@message` that it finds becomes an entry in the channel's
`messages` map.

So the operation is what connects a message to a channel. Delete the `send`
operation and the channel carries no message. The emitter reports that as
`channel-no-messages`.

A nested interface is a separate scope. It can carry a channel of its own.
Example 05 shows the same rule for a nested namespace.

## Why `operations` is empty

The emitted document carries `operations: {}`. That is on purpose.

The `@send` and `@receive` decorators do not exist yet. Until they land, no
TypeSpec operation reaches the AsyncAPI `operations` object. The operation
still has a job: it declares which messages the channel carries, and it
declares the channel address parameters.

## The emitted document

```yaml
asyncapi: 3.1.0
id: urn:example:hello-service
info:
  title: Hello Service
  version: 1.0.0
  description: The smallest AsyncAPI document this emitter can produce.
defaultContentType: application/json
channels:
  Greetings:
    address: hello.greetings
    description: Greetings sent to every listener.
    messages:
      Greeting:
        $ref: "#/components/messages/Greeting"
operations: {}
components:
  schemas:
    Greeting:
      type: object
      properties:
        to:
          type: string
          description: The recipient of the greeting.
        text:
          type: string
          description: The text of the greeting.
      required:
        - to
        - text
      description: A greeting sent to one recipient.
  messages:
    Greeting:
      name: Greeting
      description: A greeting sent to one recipient.
      payload:
        $ref: "#/components/schemas/Greeting"
```

## Next

Read [02-payload-schemas](../02-payload-schemas/) for the schema layer.
