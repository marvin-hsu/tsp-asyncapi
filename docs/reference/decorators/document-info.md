---
title: "Document Info"
description: "Fills the AsyncAPI `info` block on the service namespace. The argument's shape:"
---

# Document Info

## `@info`

```typespec
extern dec info(target: Namespace, info: valueof AsyncAPIInfo);
```

Fills the AsyncAPI `info` block on the service namespace. The argument's shape:

| Field            | Type                      | Required |
| ---------------- | ------------------------- | -------- |
| `version`        | `string`                  | yes      |
| `description`    | `string`                  | no       |
| `termsOfService` | `string`                  | no       |
| `contact`        | `{ name?, url?, email? }` | no       |
| `license`        | `{ name, url? }`          | no       |

```typespec
@service(#{ title: "Order Service API" })
@info(#{
  version: "1.0.0",
  description: "Order events.",
  contact: #{ name: "API Support", email: "support@example.com" },
  license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
})
namespace Orders;
```

```yaml
info:
  title: Order Service API
  version: 1.0.0
  description: Order events.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
```

Without `@info`, `info.version` falls back to `0.0.0`. If `@info` sets no `description`, a `@doc` (or `/** ... */` doc comment) on the namespace fills it instead.

## `@externalDocs`

```typespec
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
```

Attaches an external documentation link. The target is declared `unknown` because external docs attach in several places. The emitter reads it at six of them:

| Applied to                                           | Emitted on                      |
| ---------------------------------------------------- | ------------------------------- |
| The service namespace                                | `info.externalDocs`             |
| A namespace carrying `@server`                       | every server it declares        |
| A `@message` model                                   | that message's `externalDocs`   |
| Any model, scalar, or property that becomes a schema | that schema's `externalDocs`    |
| A `@channel` interface                               | that channel's `externalDocs`   |
| A `@send`/`@receive` operation                       | that operation's `externalDocs` |

A `@message` model emits the link on both the message and its payload schema, which is what `@doc` already does.

The servers come from the service namespace, and `info` reads that same namespace, so one link on that namespace appears in both places. AsyncAPI defines `externalDocs` on both objects.

The `url` must be an absolute URL. AsyncAPI marks the field with the `uri` format, so a relative one such as `/docs` makes a parser reject the whole document. A url that is not absolute reports an [`invalid-url`](../diagnostics#invalid-url) error, and that application is dropped.

```typespec
@externalDocs("https://example.com/docs", "Service Documentation")
namespace Orders;
```

```yaml
info:
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
```

```typespec
@message
@externalDocs("https://example.com/order-created", "How to consume this message.")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      externalDocs:
        url: https://example.com/order-created
        description: How to consume this message.
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

## `@asyncTag`

```typespec
extern dec asyncTag(target: unknown, name: valueof string, metadata?: valueof AsyncAPITag);

model AsyncAPITag {
  description?: string;
  externalDocs?: ExternalDocs;
}

model ExternalDocs {
  url: string;
  description?: string;
}
```

Adds one tag, with its metadata, to the emitted object. Repeatable: each application adds one tag, and the emitted array follows source order.

It is named `asyncTag` and not `tag` on purpose, so that the built-in `@tag` stays unambiguous.

Two things separate it from the built-in `@tag`:

|          | Built-in `@tag`                       | `@asyncTag`                                  |
| -------- | ------------------------------------- | -------------------------------------------- |
| Argument | A name, and nothing else              | A name plus `description` and `externalDocs` |
| Target   | `Namespace \| Interface \| Operation` | Anything, `Model` included                   |

A message is a model, so **the built-in `@tag` cannot tag a message at all** — the compiler rejects the application.

```typespec
@message
@asyncTag("orders", #{
  description: "Everything about orders.",
  externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
})
@asyncTag("public")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      tags:
        - name: orders
          description: Everything about orders.
          externalDocs:
            url: https://example.com/orders
            description: The order guide.
        - name: public
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

The emitter reads it at five places:

| Applied to                     | Emitted on               |
| ------------------------------ | ------------------------ |
| The service namespace          | `info.tags`              |
| A namespace carrying `@server` | every server it declares |
| A `@message` model             | that message's `tags`    |
| A `@channel` interface         | that channel's `tags`    |
| A `@send`/`@receive` operation | that operation's `tags`  |

The servers come from the service namespace, and `info` reads that same namespace, so one tag on that namespace appears in both places. AsyncAPI defines `tags` on both objects. Each server gets its own copy, so editing one server's tag cannot reach another's.

The name must not be empty. `name` is required on an AsyncAPI Tag Object. `@asyncTag("")` reports [`empty-tag-name`](../diagnostics#empty-tag-name), and the tag is dropped.

### Merging

One name means one Tag Object per object. Two applications that name one tag on one target merge field by field:

- **Built-in `@tag` plus `@asyncTag`, same name.** They merge, and the metadata wins. The built-in decorator carries a name and nothing that could disagree with it.
- **Two `@asyncTag`, same name, different fields.** They merge. One `description` and one `externalDocs` together make one Tag Object.
- **Two `@asyncTag`, same name, one field with two different values.** This is [`conflicting-tag-metadata`](../diagnostics#conflicting-tag-metadata), an error. The first application in source order keeps the field.

One name on **two different targets** may carry different metadata, and that is not an error. AsyncAPI gives every object its own `tags` array, and those arrays are independent.

## `@extension`

```typespec
extern dec extension(target: unknown, key: valueof string, value: valueof unknown);
```

Adds one `x-` specification extension to the object the target emits. The value is any JSON value, and it is emitted as written.

Repeatable: each application adds one key. The emitted keys follow source order, and they come after every specification field of the object.

The emitter reads it at four places:

| Applied to                     | Emitted on            |
| ------------------------------ | --------------------- |
| The service namespace          | `info`                |
| A `@channel` interface         | that channel object   |
| A `@send`/`@receive` operation | that operation object |
| A `@message` model             | that message object   |

A target that emits more than one object gets the extension on each of them. A namespace that is both the service and a channel is one such target.

The key must match the AsyncAPI Specification Extensions pattern, `^x-[\w\d\.\-\_]+$`. That is `x-`, then one or more letters, digits, underscores, dots, or hyphens. AsyncAPI reads no other key as a specification extension. Any other key reports [`invalid-extension-key`](../diagnostics#invalid-extension-key) and that application is dropped.

One key on one target takes one value. A second application of the same key on the same target reports [`duplicate-extension-key`](../diagnostics#duplicate-extension-key). The first application in source order is kept.

The value must be one the emitter can write as JSON. A value it cannot write reports [`unserializable-extension`](../diagnostics#unserializable-extension) and that application is dropped.

```typespec
@service(#{ title: "Order Service API" })
@info(#{ version: "1.0.0" })
@extension("x-owner", "orders-team")
@extension("x-sla", #{ tier: "gold", hours: 24 })
namespace Orders;
```

```yaml
info:
  title: Order Service API
  version: 1.0.0
  x-owner: orders-team
  x-sla:
    tier: gold
    hours: 24
```

```typespec
@message
@extension("x-schema-registry-id", 4711)
model OrderCreated {
  id: string;
}

@channel("orders.created")
@extension("x-retention-days", 7)
interface OrderChannel {
  @send
  @extension("x-audit", true)
  publishOrderCreated(payload: OrderCreated): void;
}
```

```yaml
channels:
  orders.created:
    address: orders.created
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
    x-retention-days: 7
operations:
  publishOrderCreated:
    action: send
    channel:
      $ref: "#/channels/orders.created"
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
    x-audit: true
components:
  messages:
    OrderCreated:
      name: OrderCreated
      payload:
        $ref: "#/components/schemas/OrderCreated"
      x-schema-registry-id: 4711
```

### `@extension` and `@jsonSchemaExtension`

The two write to different layers, and the split does not change.

|             | `@extension`                                            | [`@jsonSchemaExtension`](./schemas#jsonschemaextension) |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Writes into | An AsyncAPI object: `info`, channel, operation, message | A JSON Schema in `components.schemas`                   |
| Key shape   | `^x-[\w\d\.\-\_]+$`                                     | Any key                                                 |
| Typical use | Tooling metadata beside the specification fields        | A JSON Schema keyword the emitter has no decorator for  |

A `@message` model produces both a message object and a payload schema. `@extension` on that model writes the message object. To add a keyword to the payload schema, use `@jsonSchemaExtension`.

### Servers and security schemes are not supported

`@extension` cannot write an extension on a server or on a security scheme.

Both are declared with a named argument on a namespace, as in `@server("production", #{ ... })`. One namespace may declare several of them. The target of `@extension` is the namespace, so the application cannot name which server or which scheme it means.

An extension on the service namespace therefore lands on `info` alone. It does not reach the servers that namespace declares. This differs from `@externalDocs` and `@asyncTag`, which copy onto every server.

A target that emits none of the four supported objects reports [`extension-target-not-emitted`](../diagnostics#extension-target-not-emitted), and every extension on it is dropped.
