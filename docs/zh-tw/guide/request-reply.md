---
title: "Request 與 Reply"
description: "AsyncAPI 3 有兩種方式描述 request/reply。本頁介紹兩種寫法，並說明各自的適用時機。"
---

# Request 與 Reply

AsyncAPI 3 有兩種方式描述 request/reply。本頁介紹兩種寫法，並說明各自的適用時機。

## 先從 operation 說起

operation 是這個應用在某個 channel 上做的事。[`@send`](../reference/decorators/operations#send) 標記自己送出去的 message，[`@receive`](../reference/decorators/operations#receive) 標記自己收進來的 message。視角一律是自己這個應用，不是 broker。

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

`@send` 的參數型別是送出去的 message，回傳型別是收回來的回覆。`@receive` 反過來，回傳型別是收進來的 message，參數型別是送出去的回覆。

## `reply` 物件

簽章兩邊都指到同一個 channel 的 message 時，emitter 就輸出 `reply` 物件。同一個 channel 上的 request/reply 不用另外標記。

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

### 回覆走另一個 channel

回覆走不同 channel 時，用 [`@replyChannel`](../reference/decorators/operations#replychannel)。引數是那個 channel 所在的 interface 或 namespace，不是 channel 的 id。

回覆 message 不會列在請求 channel 的 `messages` 底下，而是列在回覆 channel 底下。AsyncAPI 把這個欄位讀成「走這個 channel 的 message」，而回覆走的是回覆 channel。

回覆 channel 因此不需要自己的 operation。純粹為了接回應而存在的 channel 可以是空的，emitter 一樣會把回覆 message 放進去。

### 回覆位址在執行期才決定

回覆位址要到執行期才知道時，用 [`@replyAddress`](../reference/decorators/operations#replyaddress)。送出端把位址寫進 message，回應端從那裡讀。

AsyncAPI 規定這種回覆 channel 的 `address` 必須是 `null`，那個 channel 因此要用 [`@dynamicChannel`](../reference/decorators/channels#dynamicchannel) 宣告。

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

`reply` 不是唯一的寫法。用一對 operation 也能描述同一次交換，耦合更鬆：一邊送請求、收回應，另一邊做相反的事。message 上的 [`@correlationId`](../reference/decorators/messages#correlationid) 讓消費端知道某個回應對應到哪一個請求。

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
| 回覆 channel 在設計期已知          | `reply` 搭配 `@replyChannel`     |
| 回覆位址在執行期才決定             | `reply` 搭配 `@replyAddress`     |
| 兩邊是各自獨立、各有一份規格的應用 | 兩個 operation 加 correlation id |

## 下一步

- 到 [Decorator](../reference/decorators/) 參考頁查看完整簽章。
- emitter 發出警告或錯誤時，到[診斷訊息](../reference/diagnostics)查詢。
