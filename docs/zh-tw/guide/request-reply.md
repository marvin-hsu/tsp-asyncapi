---
title: "Request 與 Reply"
description: "AsyncAPI 3 有兩種方式描述 request/reply。本頁介紹兩種寫法，並說明各自的適用時機。"
---

# Request 與 Reply

AsyncAPI 3 有兩種方式描述 request/reply。本頁介紹兩種寫法，並說明各自的適用時機。

## 先從 operation 說起

operation 是本應用在某個 channel 上做的事。[`@send`](../reference/decorators/operations#send) 標記本應用送出的 message。[`@receive`](../reference/decorators/operations#receive) 標記本應用接收的 message。兩個動作都是本應用視角，不是 broker 視角。

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

`@send` operation 的參數型別指出它送出哪些 message。回傳型別指出回覆的 message。`@receive` operation 的兩側則相反。

## `reply` 物件

簽章兩側都指出該 channel 的 message 時，emitter 會輸出 `reply` 物件。同一個 channel 上的 request/reply 不需要額外標記。

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

回覆走不同 channel 時，用 [`@replyChannel`](../reference/decorators/operations#replychannel)。引數是帶有該 channel 的 interface 或 namespace，不是 channel 的 id。

回覆 message 不會出現在請求 channel 的 `messages` 中，而是出現在回覆 channel 的 `messages` 中。AsyncAPI 把該欄位讀作走這個 channel 的 message，而這個回覆走的是回覆 channel。

所以回覆 channel 不需要自己的 operation。只為了回應某個 operation 而存在的 channel 可以是空的，emitter 仍會把回覆 message 放進去。

### 回覆位址在執行期才決定

回覆位址只有在執行期才知道時，用 [`@replyAddress`](../reference/decorators/operations#replyaddress)。傳送端把位址放進 message，回應端從那裡讀出來。

這種情況下 AsyncAPI 要求回覆 channel 的 address 是 `null`。所以那個 channel 要用 [`@dynamicChannel`](../reference/decorators/channels#dynamicchannel) 宣告。

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

`reply` 不是描述 request/reply 的唯一途徑。一對 operation 也能表達同一個交換，而且耦合更鬆。一邊送出請求並接收回應，另一邊做相反的事。每個 message 上的 [`@correlationId`](../reference/decorators/messages#correlationid) 讓消費端知道某個回應對應到哪個請求。

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

官方的 `rpc-client` 與 `rpc-server` 範例就是這種寫法。兩種風格都是合法的 AsyncAPI 3。

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
