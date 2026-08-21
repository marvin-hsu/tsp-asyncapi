---
title: "Request and Reply"
description: "AsyncAPI 3 describes a request and reply exchange in two ways. This page shows both, and says when to use each."
---

# Request and Reply

AsyncAPI 3 describes a request and reply exchange in two ways. This page shows both, and says when to use each.

## Operations come first

An operation is what an application does over a channel. [`@send`](../reference/decorators/operations#send) marks a message this application sends. [`@receive`](../reference/decorators/operations#receive) marks a message it receives. Both actions are written from the point of view of this application, not from the point of view of the broker.

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

The parameter types of a `@send` operation name the messages it sends. Its return type names the messages of the reply. A `@receive` operation reads the two sides the other way round.

## The `reply` object

The emitter writes a `reply` object when both sides of the signature name a message of the channel. Nothing else is needed for a request and reply over one channel.

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

### A reply over another channel

Use [`@replyChannel`](../reference/decorators/operations#replychannel) when the reply travels over a different channel. The argument is the interface or namespace that carries that channel, not the id of the channel.

The reply message leaves the `messages` map of the request channel and joins the `messages` map of the reply channel. AsyncAPI reads that map as the messages that travel over that channel, and this reply travels over the reply channel.

So the reply channel needs no operation of its own. A channel that exists only to answer one operation stays empty, and the emitter still gives it the reply message.

### A reply address decided at runtime

Use [`@replyAddress`](../reference/decorators/operations#replyaddress) when the address of the reply is only known at runtime. The sender puts the address in the message, and the responder reads it from there.

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

`reply` is not the only way to model request and reply. Two paired operations express the same exchange in a loosely coupled way. One application sends the request and receives the response. The other application does the inverse. A [`@correlationId`](../reference/decorators/messages#correlationid) on each message tells a consumer which request a response answers.

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

The official `rpc-client` and `rpc-server` examples use this style. Both styles are valid AsyncAPI 3.

## Which style to use

| Situation                                                   | Style                               |
| ----------------------------------------------------------- | ----------------------------------- |
| The request and the response belong to one exchange         | `reply`                             |
| The reply channel is known at design time                   | `reply` with `@replyChannel`        |
| The reply address is decided at runtime                     | `reply` with `@replyAddress`        |
| The two sides are separate applications with separate specs | Two operations and a correlation id |

## Next steps

- Browse the [Decorators](../reference/decorators/) reference for exact signatures.
- When the emitter warns or errors, look it up in [Diagnostics](../reference/diagnostics).
