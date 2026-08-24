---
outline: 2
---

# Reusable components

`components` holds what more than one place in the document can point at. A fragment written there is said once. Every place that carries it writes a `$ref` instead of a copy.

The emitter decides this for you. There is no decorator and no emitter option to turn it on or off.

## What earns a component

The emitter fills these sections of `components`:

| Section             | What goes there                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `schemas`           | Every named model, enum, union, and user-declared scalar. A schema written in another language, on its second use |
| `serverVariables`   | Every server address variable                                                                                     |
| `messages`          | Every `@message` model                                                                                            |
| `securitySchemes`   | Every `@securityScheme`                                                                                           |
| `parameters`        | Every channel address parameter                                                                                   |
| `correlationIds`    | A `@correlationId` two or more messages state alike                                                               |
| `serverBindings`    | A Bindings Object two or more servers carry alike                                                                 |
| `channelBindings`   | A Bindings Object two or more channels carry alike                                                                |
| `operationBindings` | A Bindings Object two or more operations carry alike                                                              |
| `tags`              | Every tag                                                                                                         |
| `externalDocs`      | An `@externalDocs` two or more places carry alike                                                                 |

`messageBindings` follows the same rule as the other three binding sections.

## The two rules

Which section a fragment lands in follows one of two rules. The rule depends on whether the author gave the fragment a name.

### A named fragment is always shared

A tag carries the name its author wrote. So does a channel parameter, a server variable, and a scalar. One use is enough. The component is keyed by that name.

```typespec
@service(#{ title: "Orders" })
@asyncTag("edge")
namespace Orders;
```

```yaml
info:
  title: Orders
  version: 0.0.0
  tags:
    - $ref: "#/components/tags/edge"
components:
  tags:
    edge:
      name: edge
```

### An unnamed fragment is shared on its second use

A Bindings Object carries no name of its own. Neither does a Correlation ID Object or an External Documentation Object. The second use is what says a component saves anything. A fragment used once stays where it is.

```typespec
@service(#{ title: "Orders" })
@kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
@server("production", #{ host: "a.example.com", protocol: "kafka" })
@server("sit", #{ host: "b.example.com", protocol: "kafka" })
namespace Orders;
```

One decorator on the namespace reaches both servers, so both carry the same Bindings Object:

```yaml
servers:
  production:
    host: a.example.com
    protocol: kafka
    bindings:
      $ref: "#/components/serverBindings/Orders"
  sit:
    host: b.example.com
    protocol: kafka
    bindings:
      $ref: "#/components/serverBindings/Orders"
components:
  serverBindings:
    Orders:
      kafka:
        schemaRegistryUrl: https://registry.example.com
        bindingVersion: 0.5.0
```

## A schema written in another language

A payload is not always a TypeSpec model. [`@rawPayload`](./decorators/messages#rawpayload) and [`@rawHeaders`](./decorators/messages#rawheaders) carry a schema the author wrote in another language. A [preview feature](../guide/protobuf-payloads) can generate one from the source. The emitter never reads inside either kind.

Such a schema carries no name of its own. So it follows the second rule: the second message that carries it earns it a `schemas` entry, and both messages then write a `$ref`. A schema one message carries stays in that message.

The key is the key of the first message that carries the schema, plus a suffix. The suffix is `Payload` for a payload and `Headers` for a headers block. A message called `OrderPlaced` therefore names the entry `OrderPlacedPayload`. A second message carrying the same schema points at that key, which is named after the first message and not after itself.

The two slots never share with each other. A message that carries the same text as its payload and its headers keeps both in place.

The key is claimed the same way every other derived key is. A key that a model already claims leaves the schema inline, and a model that later asks for the same key reports [`raw-schema-key-taken`](./diagnostics#raw-schema-key-taken).

## How a component is named

Every key comes from something the author wrote. The emitter never invents a key from a hash of the content.

1. The fragment's own name, when it has one. A tag uses its `name`. A parameter and a server variable use the key of the map they sit in. A model, an enum, a union, and a scalar use their declaration name.
2. The declaration the fragment hangs on. A Bindings Object uses the name of the type its decorator was applied to. In the example above that is the `Orders` namespace.
3. The first place that carries it. An External Documentation Object uses this, because nothing else names it. A schema written in another language uses this too.

A key is cleaned to the character set AsyncAPI states for a `components` key. This is the same encoding `components.schemas` already uses, so two names that differ never collapse onto one key.

## Two fragments of one name

Two Tag Objects can share a name and differ in everything else. They are two fragments asking for one key.

Neither is shared then. Both places write the tag itself. Choosing a winner would silently give one place the other place's text.

The same holds for a channel parameter of one name that two channels describe differently.

## When a property writes a scalar in place

A user-declared scalar earns a component, and a property that names it writes a `$ref`.

There is one exception. A property that says something of its own about the value writes the scalar in place. This covers `@doc`, `@summary`, `@example`, `@format`, and `@encode`.

Those replace what the scalar says. A `$ref` cannot take the referenced text away, so both would be written, one nested inside the other.

```typespec
@doc("An RFC 5321 mailbox address.")
scalar Email extends string;

@message
model Signup {
  contact: Email;

  /** Where the receipt goes. */
  receipt: Email;
}
```

```yaml
components:
  schemas:
    Email:
      type: string
      description: An RFC 5321 mailbox address.
    Signup:
      type: object
      properties:
        contact:
          $ref: "#/components/schemas/Email"
        receipt:
          type: string
          description: Where the receipt goes.
```

A property that only constrains the value further still writes a `$ref`. Two constraints on one value both hold, and that is what `allOf` means.

```typespec
@maxLength(254)
scalar Email extends string;

@message
model Signup {
  @maxLength(64)
  short: Email;
}
```

```yaml
short:
  allOf:
    - $ref: "#/components/schemas/Email"
  maxLength: 64
```

## A reference goes on the whole Bindings Object

AsyncAPI accepts a `$ref` at `bindings`. It does not accept one at `bindings.kafka`.

So the unit the emitter shares is the whole Bindings Object, with every protocol in it. Two servers that carry one protocol in common and differ in another share nothing.

## What the emitter does not extract

| Section                            | Why not                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operationTraits`, `messageTraits` | A trait deduplicates the emitted document, not the source. TypeSpec already provides reuse at the source level with `extends`, `is`, and spread.                       |
| `servers`                          | AsyncAPI states that a channel's `servers` must point at the root `servers` map. A server in `components` has no reader.                                               |
| `channels`                         | An operation addresses the root `channels` map. Only a channel that no operation points at could go here.                                                              |
| `operations`                       | Nothing in one document refers to an operation, so an entry here is text no tool resolves.                                                                             |
| `replies`, `replyAddresses`        | Two identical Operation Reply Objects mean two operations share a channel and a set of messages. That is a fact worth reporting to the author, not one to deduplicate. |
