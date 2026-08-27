---
title: "Channels"
description: "Exact signatures for @channel, @dynamicChannel, and @parameterLocation."
---

# Channels

## `@channel`

```typespec
extern dec channel(target: Interface | Namespace, address: valueof string, channelId?: valueof string);
```

Declares one channel. The channel owns the operations declared directly inside the interface or namespace. A nested interface, and a namespace nested inside a namespace, are separate scopes. Each of them may carry a channel of its own.

`address` is required. Without `channelId`, the key in the `channels` map is the address itself. With a broker such as Kafka, the address is the topic name, and the topic name is what a reader looks the channel up by. Pass a `channelId` to key the channel by another name.

```typespec
@service(#{ title: "Orders" })
namespace Orders;

@message
model OrderCreated {
  orderId: string;
}

@channel("orders.created")
interface OrderChannel {
  publish(event: OrderCreated): void;
}
```

```yaml
channels:
  orders.created:
    address: orders.created
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
```

The `messages` map comes from the operations of the channel. The emitter walks the type of each top-level operation parameter and the return type. It unwraps a union into its variants, and it unwraps the element type of an array or a record. A model that carries [`@message`](./messages#message) becomes one entry. The walk does not go into the properties of a model, because a nested model is payload data. A channel that names no message reports [`channel-no-messages`](../diagnostics#channel-no-messages), and the `messages` field is left out.

The address is checked while the decorator runs:

- A query string reports [`invalid-channel-address`](../diagnostics#invalid-channel-address). AsyncAPI expresses query parameters with a channel binding.
- A fragment reports the same code.
- An unbalanced or nested `{}` pair reports the same code.
- A name outside `A-Z`, `a-z`, `0-9`, `-`, and `_` reports [`invalid-channel-param-name`](../diagnostics#invalid-channel-param-name).
- A blank address reports [`empty-channel-address`](../diagnostics#empty-channel-address).

The scheme and the host are not checked. A full URL, a bare path, and a plain topic name are all legal addresses.

Apply the decorator once per target. A second application reports [`duplicate-channel-decorator`](../diagnostics#duplicate-channel-decorator).

### Address parameters

An address may hold `{name}` templates. Each name is declared by a top-level parameter of an operation the channel owns. A parameter whose type carries `@message` is a message declaration, so it never declares an address parameter.

```typespec
@channel("orders.{region}.created")
interface OrderChannel {
  publish(
    @doc("The region the order was placed in.")
    region: "eu" | "us",

    event: OrderCreated,
  ): void;
}
```

```yaml
channels:
  orders.{region}.created:
    address: orders.{region}.created
    parameters:
      region:
        enum:
          - eu
          - us
        description: The region the order was placed in.
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
```

A channel parameter carries no type, and its value is always a string.

| Parameter Object field | Source in TypeSpec                                                    |
| ---------------------- | --------------------------------------------------------------------- |
| `enum`                 | A string literal, a union of string literals, or a string-backed enum |
| `default`              | The default value of the parameter                                    |
| `description`          | `@doc`                                                                |
| `examples`             | `@example`                                                            |
| `location`             | [`@parameterLocation`](./channels#parameterlocation)                  |

The `parameters` field is emitted only when the address holds at least one template. Five mistakes are reported here: [`missing-channel-param`](../diagnostics#missing-channel-param), [`unused-channel-param`](../diagnostics#unused-channel-param), [`non-string-channel-param`](../diagnostics#non-string-channel-param), [`optional-channel-param`](../diagnostics#optional-channel-param), and [`conflicting-channel-param`](../diagnostics#conflicting-channel-param).

### Descriptive fields

A channel takes the same descriptive decorators every other object takes. `@summary` fills `title`, and `@doc` fills `description`. `@tag` and [`@asyncTag`](./document-info#asynctag) fill `tags`, and they merge the same way they merge on a message. [`@externalDocs`](./document-info#externaldocs) fills `externalDocs`.

AsyncAPI also defines `summary` on a channel. TypeSpec has no third source of prose, so the emitter never fills that field.

## `@dynamicChannel`

```typespec
extern dec dynamicChannel(target: Interface | Namespace, channelId?: valueof string);
```

Declares one channel whose address is only known at runtime. The emitted channel carries the literal `address: null`, which AsyncAPI reads as "unknown".

Without `channelId`, the key in the `channels` map is the declaration name of the target. A dynamic channel has no address to key it by.

```typespec
@message
model OrderAccepted {
  orderId: string;
}

@dynamicChannel("replies")
interface ReplyChannel {
  receive(response: OrderAccepted): void;
}
```

```yaml
channels:
  replies:
    address: null
    messages:
      OrderAccepted:
        $ref: "#/components/messages/OrderAccepted"
```

A dynamic channel never carries `parameters`, because it has no address to put a template in. Everything else works as it works on `@channel`.

Apply the decorator once per target, and never together with `@channel`. The two mistakes report [`duplicate-dynamic-channel-decorator`](../diagnostics#duplicate-dynamic-channel-decorator) and [`conflicting-channel-decorators`](../diagnostics#conflicting-channel-decorators).

## `@parameterLocation`

```typespec
extern dec parameterLocation(target: ModelProperty, location: valueof string);
```

Sets the `location` of one channel address parameter. The value is a runtime expression. It names where the parameter value sits inside the message at runtime.

```typespec
@channel("users.{userId}.signedup")
interface UserChannel {
  publish(
    @parameterLocation("$message.payload#/user/id")
    userId: string,

    event: UserSignedUp,
  ): void;
}
```

```yaml
channels:
  users.{userId}.signedup:
    address: users.{userId}.signedup
    parameters:
      userId:
        location: $message.payload#/user/id
```

The expression follows the grammar [`@correlationId`](./messages#correlationid) follows. It starts with `$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The emitter checks the format only. It does not check that the pointer names a field the payload or the headers schema declares. An expression outside the grammar reports [`invalid-parameter-location`](../diagnostics#invalid-parameter-location).

Apply the decorator once per property. A second application reports [`duplicate-parameter-location-decorator`](../diagnostics#duplicate-parameter-location-decorator).
