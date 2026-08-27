---
title: "Request 與 Reply"
description: "AsyncAPI 3 有兩種方式描述 request/reply。本頁介紹兩種寫法，並說明各自的適用時機。"
---

# Request 與 Reply

AsyncAPI 3 有兩種方式描述 request/reply。本頁介紹兩種寫法，並說明各自的適用時機。

## operation

operation 是這個應用程式在某個 channel 上做的事。[`@send`](../reference/decorators/operations#send) 表示應用程式發出去的 message，[`@receive`](../reference/decorators/operations#receive) 表示應用程式預期會接收到的 message。

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

上面兩個 operation 用的是同一個 `OrderCreated`。方向屬於 operation，不屬於 message，所以同一個 message 可以在一個 operation 是 send，在另一個是 receive。

## `reply` 物件

`reply` 由一個同時定義輸入與輸出的 operation 產生。

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

### 不使用同一個 channel 回覆

回覆走不同 channel 時，用 [`@replyChannel`](../reference/decorators/operations#replychannel)。

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

`OrderAccepted` 列在 `orders.replies` 底下，不在 `orders.create` 底下。channel 的 `messages` 是「走這個 channel 的 message」，而回覆走的是 reply channel。

`OrderReplies` 是空的 interface，沒有自己的 operation。reply channel 不需要 operation，emitter 一樣會把回覆 message 放進去。

### 動態決定回覆位址

無法預先知道回覆位址時，用 [`@replyAddress`](../reference/decorators/operations#replyaddress)。送出端把位址寫進 message，回應端從那裡讀。

AsyncAPI 規定這種 reply channel 的 `address` 必須是 `null`，那個 channel 因此要用 [`@dynamicChannel`](../reference/decorators/channels#dynamicchannel) 宣告。

```typespec
@dynamicChannel
interface ReplyChannel {}

@channel("orders.create")
interface OrderChannel {
  @send
  @replyChannel(ReplyChannel)
  @replyAddress("$message.header#/replyTo", "回覆用的 topic。")
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
        description: 回覆用的 topic。
      channel:
        $ref: "#/channels/ReplyChannel"
      messages:
        - $ref: "#/channels/ReplyChannel/messages/OrderAccepted"
```

## 另一種寫法：兩個 operation 加 correlation id

`reply` 不是唯一的寫法。用一對 operation 也能描述同一次交換來達成鬆耦合：一邊送請求、收回應，另一邊做相反的事。message 上的 [`@correlationId`](../reference/decorators/messages#correlationid) 讓消費端知道某個回應對應到哪一個請求。

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

AsyncAPI 官方的 `rpc-client` 與 `rpc-server` 範例就是這種寫法。兩種都是合法的 AsyncAPI 3。

## 如何選擇

| 情境                               | 寫法                             |
| ---------------------------------- | -------------------------------- |
| 請求與回應屬於同一個交換           | `reply`                          |
| reply channel 在設計期已知         | `reply` 搭配 `@replyChannel`     |
| 回覆位址在執行期才決定             | `reply` 搭配 `@replyAddress`     |
| 兩邊是各自獨立、各有一份規格的應用 | 兩個 operation 加 correlation id |

## 下一步

- 到 [Decorator](../reference/decorators/) 參考頁查看完整簽章。
- emitter 回報警告或錯誤時，到[診斷訊息](../reference/diagnostics)查詢。
