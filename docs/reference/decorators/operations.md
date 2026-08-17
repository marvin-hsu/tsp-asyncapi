# Operations

## `@send`

```typespec
extern dec send(target: Operation, operationId?: valueof string);
```

Marks one operation as a message this application sends. The emitted operation carries `action: "send"`. AsyncAPI 3 reads the action from the point of view of this application, so `send` means this application produces the message.

The operation points at the channel of the interface or namespace that holds it. The parameter types name the messages it sends.

```typespec
@message
model OrderCreated {
  orderId: string;
}

@channel("orders.created")
interface OrderChannel {
  @send op sendOrderCreated(event: OrderCreated): void;
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
```

Every message reference addresses the `messages` map of the channel. AsyncAPI requires that, and a reference straight into `components.messages` is invalid there.

An operation whose signature names no message carries no `messages` field. AsyncAPI reads that as "every message of the channel". The emitter never writes an empty array, because an empty array makes every message invalid.

### One operation, several messages

A broker topic often carries several event variants. Declare one parameter per message, and the operation lists them all:

```typespec
@message
model WithdrawCompleted {
  transactionId: string;
}

@message
model WithdrawFailed {
  transactionId: string;
  reason: string;
}

@channel("transaction_history")
interface TransactionHistory {
  @send op publishTransactionHistory(
    completed: WithdrawCompleted,
    failed: WithdrawFailed,
  ): void;
}
```

```yaml
operations:
  publishTransactionHistory:
    action: send
    channel:
      $ref: "#/channels/transaction_history"
    messages:
      - $ref: "#/channels/transaction_history/messages/WithdrawCompleted"
      - $ref: "#/channels/transaction_history/messages/WithdrawFailed"
```

The references keep the order of the signature, and a repeated message appears once. A union parameter expresses the same list: `event: WithdrawCompleted | WithdrawFailed` names both variants.

`operationId` overrides the key of this operation in the emitted `operations` map. Without it, the key is the name of the operation. A blank id reports [`empty-operation-id`](../diagnostics#empty-operation-id). Two operations that resolve to one key report [`duplicate-operation-id`](../diagnostics#duplicate-operation-id), and the first one in source order keeps the key.

An interface wins over the namespace around it, because a nested interface is a channel scope of its own. An operation whose scope carries no channel reports [`operation-without-channel`](../diagnostics#operation-without-channel) and is dropped.

Apply the decorator once per operation, and never together with `@receive`. The two mistakes report [`duplicate-send-decorator`](../diagnostics#duplicate-send-decorator) and [`conflicting-operation-actions`](../diagnostics#conflicting-operation-actions).

## `@receive`

```typespec
extern dec receive(target: Operation, operationId?: valueof string);
```

Marks one operation as a message this application receives. The emitted operation carries `action: "receive"`.

The channel rule is the one `@send` follows. The direction of the signature is the inverse. The return type names the messages this operation receives, and the parameter types name the messages of its reply.

```typespec
@channel("orders.created")
interface OrderChannel {
  @receive op onOrderCreated(): OrderCreated;
}
```

```yaml
operations:
  onOrderCreated:
    action: receive
    channel:
      $ref: "#/channels/orders.created"
    messages:
      - $ref: "#/channels/orders.created/messages/OrderCreated"
```

Apply the decorator once per operation, and never together with `@send`. The two mistakes report [`duplicate-receive-decorator`](../diagnostics#duplicate-receive-decorator) and [`conflicting-operation-actions`](../diagnostics#conflicting-operation-actions).

## `@replyChannel`

```typespec
extern dec replyChannel(target: Operation, channel: Interface | Namespace);
```

Names the channel the reply of one operation travels over. The argument is the interface or namespace that carries the channel, not the id of that channel. The compiler resolves the reference, so a typo cannot reach the document.

An operation with no `@replyChannel` replies over its own channel. So the decorator is only needed for a reply that travels over another channel.

```typespec
@message
model CreateOrder {
  orderId: string;
}

@message
model OrderAccepted {
  orderId: string;
}

@channel("orders.accepted")
interface ReplyChannel {
  @receive op onOrderAccepted(): OrderAccepted;
}

@channel("orders.create")
interface OrderChannel {
  @send
  @replyChannel(ReplyChannel)
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
      channel:
        $ref: "#/channels/orders.accepted"
      messages:
        - $ref: "#/channels/orders.accepted/messages/OrderAccepted"
```

The emitter also writes a reply with no decorator at all. That happens when both sides of the signature name a message of the channel, which is the same-channel request and reply shape.

AsyncAPI requires every reply message to be one the reply channel carries. The emitter puts the reply message on the named channel for you, so the named channel needs no operation of its own.

The named target must carry `@channel` or `@dynamicChannel`. A target with no channel reports [`reply-channel-not-a-channel`](../diagnostics#reply-channel-not-a-channel), and the whole `reply` object is dropped.

Apply the decorator once per operation, on an operation that carries `@send` or `@receive`. The two mistakes report [`duplicate-reply-channel-decorator`](../diagnostics#duplicate-reply-channel-decorator) and [`reply-without-action`](../diagnostics#reply-without-action).

::: tip
`reply` is not the only way to model request and reply. Two paired operations, one `@send` and one `@receive`, plus a [`@correlationId`](./messages#correlationid) on each message, express the loosely coupled style the official `rpc-client` and `rpc-server` examples use. Both styles are valid AsyncAPI 3.
:::

## `@replyAddress`

```typespec
extern dec replyAddress(target: Operation, location: valueof string, description?: valueof string);
```

Names where the address of a reply sits at runtime. A reply address is for a channel whose address is unknown at design time. The sender puts the address in the message, and the responder reads it from there.

```typespec
@dynamicChannel
interface ReplyChannel {
  @receive op onOrderAccepted(): OrderAccepted;
}

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

`location` follows the grammar [`@correlationId`](./messages#correlationid) follows. It starts with `$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The emitter checks the format only. An expression outside the grammar reports [`invalid-reply-address-location`](../diagnostics#invalid-reply-address-location), and the application is dropped.

AsyncAPI requires the address of the reply channel to be `null` when a reply address is given. So declare that channel with [`@dynamicChannel`](./channels#dynamicchannel). A reply address on a channel that carries an address reports [`reply-address-needs-dynamic-channel`](../diagnostics#reply-address-needs-dynamic-channel). The address is dropped from the reply, and the rest of the reply is kept.

Apply the decorator once per operation, on an operation that carries `@send` or `@receive`. The two mistakes report [`duplicate-reply-address-decorator`](../diagnostics#duplicate-reply-address-decorator) and [`reply-without-action`](../diagnostics#reply-without-action).
