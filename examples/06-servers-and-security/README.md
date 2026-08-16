# 06 — Servers and security

The connection side. Two servers, four security schemes, and document-level
tags and links.

This example declares no channel and no message. It emits `channels: {}` and
`operations: {}`. That is the whole shape of the example, and not a gap. An
operation needs a channel to sit on, and a channel needs a message to carry.
Neither belongs on the connection side.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/06-servers-and-security
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

## Servers

`@server(name, config)` declares one server. The name becomes the key in the
emitted `servers` map. The decorator is repeatable, so one namespace can
declare several servers.

Apply it to the service namespace. The emitter reads the servers from that
namespace only. A server on any other namespace is reported and left out.

`host` and `protocol` are required. Every other field is optional. Every
field is trimmed, and a blank optional field counts as absent.

## Server variables

`host` and `pathname` may both hold `{var}` templates. Every name used there
needs an entry in `variables`, or the emitter reports it.

- `kafka-dev` templates its host: `{tenant}.dev.kafka.example.com:9092`.
- `amqp-prod` templates both its host and its pathname.

A variable takes four optional fields: `enum`, `default`, `description` and
`examples`. AsyncAPI, unlike OpenAPI 3, does not require a `default`.

`enum` needs backticks in TypeSpec, because `enum` is a keyword.

## Security schemes

`@securityScheme(name, scheme)` defines one entry of
`components.securitySchemes`. The name becomes the key. The decorator is
repeatable.

The schemes are collected from the whole program, not from the service
namespace only. `components` is a document-wide registry, so a scheme reaches
the document from any namespace.

The `type` field picks the shape of the scheme. Each kind of scheme is a
separate model, so the type checker rejects a field that belongs to another
kind. `name` and `in` exist on `httpApiKey` and not on `scramSha512`.

This example defines four kinds.

| Key            | `type`         | Notes                                  |
| -------------- | -------------- | -------------------------------------- |
| `ledger-oauth` | `oauth2`       | two flows, each with `availableScopes` |
| `broker-scram` | `scramSha512`  | description only                       |
| `gateway-key`  | `httpApiKey`   | carries `name` and `in`                |
| `legacy-login` | `userPassword` | description only                       |

## OAuth flows

AsyncAPI models the flows as an object with four optional named fields:
`implicit`, `password`, `clientCredentials` and `authorizationCode`. Declare
at least one. An object with no flow is reported.

Each flow is its own model, because AsyncAPI requires a different set of URLs
per flow and forbids the URL the flow does not use. `implicit` takes
`authorizationUrl` and no `tokenUrl`. `clientCredentials` and `password` take
`tokenUrl` and no `authorizationUrl`. `authorizationCode` takes both.

`availableScopes` maps every scope the flow offers to its description.
AsyncAPI renames the OpenAPI `scopes` field to `availableScopes`.

The `scopes` field on the scheme itself names the subset this scheme
requires.

## Requiring a scheme

`@useSecurity(schemeName)` requires one scheme on every server of the
namespace. It is repeatable.

AsyncAPI reads the `security` array as OR. A client satisfies one of the
listed schemes.

The emitter always writes a `$ref` into `#/components/securitySchemes`. A
name that no `@securityScheme` defines is reported while the document is
built. A `@useSecurity` on a namespace that contributes no server is reported
too, because it would reach no part of the document.

`gateway-key` and `legacy-login` are defined and not required. They reach
`components.securitySchemes` and no `security` array.

**Every requirement here is server-wide.** AsyncAPI puts `security` on an
operation as well as on a server, and `@useSecurity` targets both a namespace
and an operation. An operation's requirement is added to the server's rather
than replacing it. The emitter never copies the server schemes into the
operation array, so a client satisfies both arrays.

This example declares no operation, so it can never show that half. Example
08 does. Its `publishSignupEvent` operation carries a `@useSecurity` of its
own, and the emitted operation holds a one-entry `security` array.

## Tags and external documentation

`@asyncTag(name, metadata?)` adds one tag with its metadata. It is
repeatable, and the tags keep their source order. On the service namespace,
the tags fill `info.tags`.

The decorator is named `asyncTag` and not `tag`. The built-in `@tag` lives in
the global `TypeSpec` namespace. A second `tag` here would make `@tag`
ambiguous for anyone who writes `using AsyncAPI;`.

Use `@asyncTag` where the built-in `@tag` cannot reach, and where a tag needs
metadata. The built-in `@tag` takes a name and nothing else, and its target
does not include `Model`. So a message can only be tagged through
`@asyncTag`.

`@externalDocs(url, description?)` fills `info.externalDocs`.

`security` and `externalDocs` come from the namespace, not from an individual
server. So every server the namespace declares carries the same value for
both. The `externalDocs` duplication between `info` and each server is
intended. A reader of a server object does not have to look at `info` to find
the link.

## Next

Read [07-request-and-reply](../07-request-and-reply/) for the request and
reply pattern.
