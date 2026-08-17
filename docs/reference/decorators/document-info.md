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

AsyncAPI's Schema Object defines `externalDocs` alongside `discriminator` and `deprecated` as one of the three fields it adds on top of JSON Schema draft-07. A `@message` model emits the link on both the message and its payload schema, which is what `@doc` already does.

The servers come from the service namespace, and `info` reads that same namespace, so one link on that namespace appears in both places. AsyncAPI defines `externalDocs` on both objects.

The `url` must be an absolute URL. AsyncAPI marks the field with the `uri` format, so a relative one such as `/docs` makes a parser reject the whole document. A url that is not absolute raises an [`invalid-url`](../diagnostics#invalid-url) error, and the whole application is dropped.

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

It is named `asyncTag` and not `tag` on purpose. The built-in `@tag` lives in the global `TypeSpec` namespace, which is always in scope. A second `tag` in the `AsyncAPI` namespace would make a plain `@tag(...)` ambiguous for anyone who writes `using AsyncAPI;`, and every existing `@tag` would have to be rewritten as `@TypeSpec.tag(...)`.

Two things separate it from the built-in `@tag`:

|          | Built-in `@tag`                       | `@asyncTag`                                  |
| -------- | ------------------------------------- | -------------------------------------------- |
| Argument | A name, and nothing else              | A name plus `description` and `externalDocs` |
| Target   | `Namespace \| Interface \| Operation` | Anything, `Model` included                   |

AsyncAPI puts a full Tag Object on each item, where OpenAPI puts a bare string. And a message is a model, so **the built-in `@tag` cannot tag a message at all** — the compiler rejects the application.

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

The emitter reads it on the service namespace (`info.tags`) and on a message. Applying it elsewhere records the tag but emits nothing yet.

The name must not be empty. `name` is required on an AsyncAPI Tag Object, and a blank one names nothing a consumer can match, so `@asyncTag("")` is reported as [`empty-tag-name`](../diagnostics#empty-tag-name) and the tag is dropped.

### Merging

One name means one Tag Object per object. Two applications that name one tag on one target merge field by field:

- **Built-in `@tag` plus `@asyncTag`, same name.** They merge, and the metadata wins. The built-in decorator carries a name and nothing that could disagree with it.
- **Two `@asyncTag`, same name, different fields.** They merge. One `description` and one `externalDocs` together make one Tag Object.
- **Two `@asyncTag`, same name, one field with two different values.** This is [`conflicting-tag-metadata`](../diagnostics#conflicting-tag-metadata), an error. The first application in source order keeps the field.

One name on **two different targets** may carry different metadata, and that is not an error. AsyncAPI gives every object its own `tags` array, and those arrays are independent.
