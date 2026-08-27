---
title: "Request and Reply"
description: "AsyncAPI 3 describes a request and reply exchange in two ways. This page shows both, and says when to use each."
---

# Request and Reply

AsyncAPI 3 describes a request and reply exchange in two ways. This page shows both, and says when to use each.

## Operations

An operation is what an application does over a channel. [`@send`](../reference/decorators/operations#send) marks a message the application sends. [`@receive`](../reference/decorators/operations#receive) marks a message the application expects to receive.

```typespec
@message
model OrderCreated {
  orderId: string;
}

@channel("orders.created")
interface OrderChannel {
  @send op sendOrderCreated(event: OrderCreated): void;
  @receive op onOrderCreated(): OrderCreated;
}
```

```yaml
operations:
  sendOrderCreated:
    action: send
    channel:
      $ref: "#/channels/orders.created"
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/orders.created"
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
```

Both operations above name the same `OrderCreated`. The direction belongs to the operation, not to the message. So one message can be sent by one operation and received by another.

## The `reply` object

A `reply` comes from one operation that declares both an input and an output.

```typespec
@message
model CreateOrder {
  orderId: string;
}

@message
model OrderAccepted {
  orderId: string;
}

@channel("orders.create")
interface OrderChannel {
  @send op createOrder(command: CreateOrder): OrderAccepted;
}
```

```yaml
operations:
  createOrder:
    action: send
    channel:
      $ref: "#/channels/orders.create"
    messages:
      - $ref: "#/channels/orders.create/messages/CreateOrder"
    reply:
      channel:
        $ref: "#/channels/orders.create"
      messages:
        - $ref: "#/channels/orders.create/messages/OrderAccepted"
```

### When the reply is not on the same channel

Use [`@replyChannel`](../reference/decorators/operations#replychannel) when the reply travels over a different channel.

```typespec
@channel("orders.replies")
interface OrderReplies {}

@channel("orders.create")
interface OrderCommands {
  @send
  @replyChannel(OrderReplies)
  op createOrder(command: CreateOrder): OrderAccepted;
}
```

```yaml
channels:
  orders.replies:
    address: orders.replies
    messages:
      OrderAccepted:
        $ref: "#/components/messages/OrderAccepted"
  orders.create:
    address: orders.create
    messages:
      CreateOrder:
        $ref: "#/components/messages/CreateOrder"
operations:
  createOrder:
    action: send
    channel:
      $ref: "#/channels/orders.create"
    messages:
      - $ref: "#/channels/orders.create/messages/CreateOrder"
    reply:
      channel:
        $ref: "#/channels/orders.replies"
      messages:
        - $ref: "#/channels/orders.replies/messages/OrderAccepted"
```

`OrderAccepted` sits under `orders.replies`, not under `orders.create`. A channel's `messages` map holds the messages that travel over that channel. This reply travels over the reply channel.

`OrderReplies` is an empty interface with no operation of its own. A reply channel needs no operation. The emitter gives it the reply message anyway.

### A reply address decided dynamically

Use [`@replyAddress`](../reference/decorators/operations#replyaddress) when the address of the reply cannot be known in advance. The sender puts the address in the message, and the responder reads it from there.

AsyncAPI requires the address of the reply channel to be `null` in that case. So declare that channel with [`@dynamicChannel`](../reference/decorators/channels#dynamicchannel).

```typespec
@dynamicChannel
interface ReplyChannel {}

@channel("orders.create")
interface OrderChannel {
  @send
  @replyChannel(ReplyChannel)
  @replyAddress("$message.header#/replyTo", "The reply topic.")
  op createOrder(command: CreateOrder): OrderAccepted;
}
```

```yaml
operations:
  createOrder:
    action: send
    channel:
      $ref: "#/channels/orders.create"
    messages:
      - $ref: "#/channels/orders.create/messages/CreateOrder"
    reply:
      address:
        location: $message.header#/replyTo
        description: The reply topic.
      channel:
        $ref: "#/channels/ReplyChannel"
      messages:
        - $ref: "#/channels/ReplyChannel/messages/OrderAccepted"
```

## The other style: two operations and a correlation id

`reply` is not the only way to model request and reply. Two paired operations express the same exchange. They keep the two sides loosely coupled. One application sends the request and receives the response. The other application does the inverse. A [`@correlationId`](../reference/decorators/messages#correlationid) on each message tells a consumer which request a response answers.

```typespec
@message
model CreateOrder {
  @header
  correlationId: string;

  orderId: string;
}

@message
@correlationId("$message.header#/correlationId")
model OrderAccepted {
  @header
  correlationId: string;

  orderId: string;
}

@channel("orders.create")
interface RequestChannel {
  @send op createOrder(command: CreateOrder): void;
}

@channel("orders.accepted")
interface ResponseChannel {
  @receive op onOrderAccepted(): OrderAccepted;
}
```

AsyncAPI's own `rpc-client` and `rpc-server` examples use this style. Both are valid AsyncAPI 3.

## Which style to use

| Situation                                                   | Style                               |
| ----------------------------------------------------------- | ----------------------------------- |
| The request and the response belong to one exchange         | `reply`                             |
| The reply channel is known at design time                   | `reply` with `@replyChannel`        |
| The reply address is decided dynamically                    | `reply` with `@replyAddress`        |
| The two sides are separate applications with separate specs | Two operations and a correlation id |

## Next steps

- Browse the [Decorators](../reference/decorators/) reference for exact signatures.
- When the emitter reports a warning or an error, look it up in [Diagnostics](../reference/diagnostics).
