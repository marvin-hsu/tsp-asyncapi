# 07 — Request and reply

The request and reply pattern. Three operations, and the two shapes of an
AsyncAPI `reply` object.

Example 01 introduces `@send`, and example 05 adds `@receive`. Read both
first.

## The signature rule

Read this before the source. A reader who guesses it gets it wrong.

| Decorator  | The parameters are        | The return type is        |
| ---------- | ------------------------- | ------------------------- |
| `@send`    | the messages sent         | the messages of the reply |
| `@receive` | the messages of the reply | the messages received     |

For `@send` the parameters are the messages sent, and the return type is the
messages of the reply. For `@receive` the parameters are the messages of the
reply, and the return type is the messages received.

So the two decorators read one signature in opposite directions.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/07-request-and-reply
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

## The three operations

| Operation         | Action    | Channel           | What it shows                       |
| ----------------- | --------- | ----------------- | ----------------------------------- |
| `getOrderStatus`  | `send`    | `OrderStatusDesk` | the implicit reply                  |
| `createOrder`     | `send`    | `OrderCommands`   | `@replyChannel` and `@replyAddress` |
| `onOrderAccepted` | `receive` | `order-replies`   | the inverted signature              |

The channel key `order-replies` is the argument of `@dynamicChannel` on
`interface OrderReplies`. That argument is the channel id. It overrides the
declaration name in the `channels` map, the way the second argument of
`@channel` does. Example 05 states the same rule.

## The implicit reply

`getOrderStatus` carries no reply decorator at all.

Both sides of its signature name a message of its own channel. The parameter
names `OrderStatusQuery`. The return type names `OrderStatus`. The emitter
reads that as request and reply over one channel, and it writes a `reply`
object.

```yaml
getOrderStatus:
  action: send
  channel:
    $ref: "#/channels/OrderStatusDesk"
  messages:
    - $ref: "#/channels/OrderStatusDesk/messages/OrderStatusQuery"
  reply:
    channel:
      $ref: "#/channels/OrderStatusDesk"
    messages:
      - $ref: "#/channels/OrderStatusDesk/messages/OrderStatus"
```

This is the cheapest form of the pattern. Use it when the answer travels back
over the channel the question went out on.

## The explicit reply channel

`createOrder` replies over another channel, so it carries `@replyChannel`.

The argument is the interface or the namespace that carries the channel. It
is not the id string of that channel. The compiler resolves the reference, so
a typo cannot reach the document.

The named channel needs no operation of its own. The emitter puts the reply
message on it. `OrderReplies` declares one anyway, to show the inverted
`@receive` signature.

The named target must carry `@channel` or `@dynamicChannel`. A target with no
channel reports `reply-channel-not-a-channel`, and the whole `reply` object is
dropped.

## The reply address

**`@replyAddress` depends on the reply channel being dynamic.** Declare that
channel with `@dynamicChannel`, not with `@channel`.

`@replyAddress("$message.header#/replyTo", "The reply topic.")` names where
the address of the reply sits at runtime. The sender puts the address in the
message, and the responder reads it from there.

AsyncAPI requires the address of the reply channel to be `null` when a reply
address is given. That null address is exactly what `@dynamicChannel`
produces. `OrderReplies` is therefore declared `@dynamicChannel`.

Put `@replyAddress` on an operation whose reply channel carries an address,
and the emitter reports `reply-address-needs-dynamic-channel`. It drops the
`address` from the reply and keeps the rest of it.

```yaml
createOrder:
  action: send
  channel:
    $ref: "#/channels/OrderCommands"
  messages:
    - $ref: "#/channels/OrderCommands/messages/CreateOrder"
  reply:
    address:
      location: $message.header#/replyTo
      description: The reply topic.
    channel:
      $ref: "#/channels/order-replies"
    messages:
      - $ref: "#/channels/order-replies/messages/OrderAccepted"
```

`location` follows the grammar `@correlationId` follows. It starts with
`$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The
emitter checks the format only. An expression outside the grammar reports
`invalid-reply-address-location`, and the application is dropped.

## `@receive` in its inverted form

`onOrderAccepted` is written `op onOrderAccepted(): OrderAccepted;`.

It takes no parameter, because it declares no reply of its own. `OrderAccepted`
sits in the return type, because for `@receive` the return type is the
messages received.

Write it as `op onOrderAccepted(event: OrderAccepted): void;` and the emitted
operation carries neither `messages` nor `reply`. The return type is empty, so
the operation receives nothing. The parameter is read as the reply, and a
reply needs a message on both sides to be emitted.

Nothing is reported for that mistake, because the signature is legal. AsyncAPI
reads a missing `messages` as "every message of the channel", so the operation
silently widens instead of failing. That is the mistake this example exists to
prevent.

## The other way to model request and reply

`reply` is not the only way. Two paired operations, one `@send` and one
`@receive`, with a `@correlationId` on each message, is the loosely coupled
style. The official `rpc-client` and `rpc-server` examples use it.

Both styles are valid AsyncAPI 3. `CreateOrder` and `OrderAccepted` each carry
a `@correlationId` here, so the correlation half of that style is already in
this document.

## What this document cannot express yet

A real broker states the reply topic in a protocol binding, next to the reply
address. This emitter has no binding decorator of any kind, on an operation or
anywhere else. Add the binding by hand to the emitted document.

## Next

Read [08-kafka-user-signup](../08-kafka-user-signup/) for one realistic
contract that combines everything.
