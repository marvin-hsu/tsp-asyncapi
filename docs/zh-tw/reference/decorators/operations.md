# 操作 (Operations)

## `@send`

```typespec
extern dec send(target: Operation, operationId?: valueof string);
```

把一個 operation 標記成本應用送出的 message。輸出的 operation 帶 `action: "send"`。AsyncAPI 3 的 `action` 是本應用視角的動詞。`send` 表示本應用產生這個 message。

operation 指向包住它的 interface 或 namespace 上的 channel。參數型別指出它送出哪些 message。

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
      $ref: "#/channels/OrderChannel"
    messages:
      - $ref: "#/channels/OrderChannel/messages/OrderCreated"
```

每個 message 參照都指向 channel 的 `messages` map。這是 AsyncAPI 的規定。直接指向 `components.messages` 在此處不合法。

簽章沒有指出任何 message 的 operation 不輸出 `messages` 欄位。AsyncAPI 把這讀作「channel 上任何 message 皆可」。emitter 絕不輸出空陣列，因為空陣列會讓所有 message 都不合法。

`operationId` 覆寫這個 operation 在輸出 `operations` map 中的 key。不給時，key 是 operation 的名稱。空白的 id 回報 [`empty-operation-id`](../diagnostics#empty-operation-id)。兩個 operation 對應到同一個 key 時回報 [`duplicate-operation-id`](../diagnostics#duplicate-operation-id)，原始碼順序在前的保留該 key。

interface 優先於外層的 namespace。巢狀 interface 是獨立的 channel 範圍。所在範圍沒有 channel 的 operation 回報 [`operation-without-channel`](../diagnostics#operation-without-channel) 並被丟棄。

一個 operation 只能套用一次，也不能與 `@receive` 併用。兩種錯誤分別回報 [`duplicate-send-decorator`](../diagnostics#duplicate-send-decorator) 與 [`conflicting-operation-actions`](../diagnostics#conflicting-operation-actions)。

## `@receive`

```typespec
extern dec receive(target: Operation, operationId?: valueof string);
```

把一個 operation 標記成本應用接收的 message。輸出的 operation 帶 `action: "receive"`。

channel 的規則與 `@send` 相同。簽章的方向相反。回傳型別指出這個 operation 接收哪些 message，參數型別指出回覆的 message。

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
      $ref: "#/channels/OrderChannel"
    messages:
      - $ref: "#/channels/OrderChannel/messages/OrderCreated"
```

一個 operation 只能套用一次，也不能與 `@send` 併用。兩種錯誤分別回報 [`duplicate-receive-decorator`](../diagnostics#duplicate-receive-decorator) 與 [`conflicting-operation-actions`](../diagnostics#conflicting-operation-actions)。

## `@replyChannel`

```typespec
extern dec replyChannel(target: Operation, channel: Interface | Namespace);
```

指定 operation 的回覆走哪一個 channel。引數是帶有該 channel 的 interface 或 namespace，不是 channel 的 id。compiler 會解析這個型別參照，所以打錯名稱不會進到文件。

沒有 `@replyChannel` 的 operation 在自己的 channel 上回覆。所以只有回覆走另一個 channel 時才需要這個 decorator。

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
      $ref: "#/channels/OrderChannel"
    messages:
      - $ref: "#/channels/OrderChannel/messages/CreateOrder"
    reply:
      channel:
        $ref: "#/channels/ReplyChannel"
      messages:
        - $ref: "#/channels/ReplyChannel/messages/OrderAccepted"
```

不寫任何 decorator 時 emitter 也可能輸出 `reply`。條件是簽章兩側都指出該 channel 的 message。這就是同一個 channel 上的 request 與 reply 形狀。

AsyncAPI 規定每個回覆 message 都必須是回覆 channel 上的 message。emitter 會自動把回覆 message 放到指定的 channel 上。所以指定的 channel 不需要自己的 operation。

指定的目標必須帶 `@channel` 或 `@dynamicChannel`。沒有 channel 的目標回報 [`reply-channel-not-a-channel`](../diagnostics#reply-channel-not-a-channel)，整個 `reply` 物件被丟棄。

一個 operation 只能套用一次，而且該 operation 要帶 `@send` 或 `@receive`。兩種錯誤分別回報 [`duplicate-reply-channel-decorator`](../diagnostics#duplicate-reply-channel-decorator) 與 [`reply-without-action`](../diagnostics#reply-without-action)。

::: tip
`reply` 不是描述 request/reply 的唯一途徑。一對 `@send` 與 `@receive` operation，再加上每個 message 上的 [`@correlationId`](./messages#correlationid)，可以表達鬆耦合的風格。官方的 `rpc-client` 與 `rpc-server` 範例就是這種寫法。兩種風格都是合法的 AsyncAPI 3。
:::

## `@replyAddress`

```typespec
extern dec replyAddress(target: Operation, location: valueof string, description?: valueof string);
```

指出回覆位址在執行期位於哪裡。回覆位址用於設計期未知位址的 channel。傳送端把位址放進 message，回應端從那裡讀出來。

```typespec
@dynamicChannel
interface ReplyChannel {
  @receive op onOrderAccepted(): OrderAccepted;
}

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
      $ref: "#/channels/OrderChannel"
    messages:
      - $ref: "#/channels/OrderChannel/messages/CreateOrder"
    reply:
      address:
        location: $message.header#/replyTo
        description: 回覆用的 topic。
      channel:
        $ref: "#/channels/ReplyChannel"
      messages:
        - $ref: "#/channels/ReplyChannel/messages/OrderAccepted"
```

`location` 的文法與 [`@correlationId`](./messages#correlationid) 相同。開頭是 `$message.header#` 或 `$message.payload#`，後面可以接 JSON Pointer。emitter 只檢查格式。超出文法的運算式回報 [`invalid-reply-address-location`](../diagnostics#invalid-reply-address-location)，並丟棄該次標記。

給了回覆位址時，AsyncAPI 要求回覆 channel 的 address 必須是 `null`。所以那個 channel 要用 [`@dynamicChannel`](./channels#dynamicchannel) 宣告。在帶有 address 的 channel 上給回覆位址會回報 [`reply-address-needs-dynamic-channel`](../diagnostics#reply-address-needs-dynamic-channel)。`address` 從 reply 中被丟棄，reply 的其餘部分保留。

一個 operation 只能套用一次，而且該 operation 要帶 `@send` 或 `@receive`。兩種錯誤分別回報 [`duplicate-reply-address-decorator`](../diagnostics#duplicate-reply-address-decorator) 與 [`reply-without-action`](../diagnostics#reply-without-action)。
