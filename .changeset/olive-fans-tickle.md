---
"tsp-asyncapi": minor
"tsp-asyncapi-core": patch
---

Add a TypeSpec linter with five rules.

Each rule catches a mistake the emitter accepts. Every one of them produces
a valid AsyncAPI document that says something the author did not mean, and
no diagnostic covers any of them.

A rule runs during semantic analysis rather than at emit time, so an editor
shows it while you type. Enable the set in `tspconfig.yaml`:

```yaml
linter:
  extends:
    - "tsp-asyncapi/recommended"
```

`recommended` holds four rules. `missing-service` catches a document that
falls back to the placeholder title and version. `channel-without-operation`
catches a channel whose operations lack `@send` and `@receive`, which
describes no traffic. `operation-without-message` catches an operation that
names no `@message` model, which AsyncAPI reads as claiming every message of
its channel. `server-protocol-mismatch` catches a server binding whose
protocol no `@server` on that namespace speaks.

`unused-security-scheme` is outside `recommended` and enabled by name. A
declared scheme nothing uses is a real intention: `components.securitySchemes`
is a registry, and a document may publish a method no channel requires yet.

`tsp-asyncapi` gains one export, `$linter`. `tsp-asyncapi-core` gains
`asyncAPILinter` on its `unstable` entry point, where the rules are
implemented. The stable API of `tsp-asyncapi-core` does not change.
