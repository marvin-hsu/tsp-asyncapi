---
title: "Channel"
description: "@channel、@dynamicChannel 與 @parameterLocation 的精確簽章。"
---

# Channel

## `@channel`

```typespec
extern dec channel(target: Interface | Namespace, address: valueof string, channelId?: valueof string);
```

宣告 channel。直接寫在該 interface 或 namespace 裡的 operation 都屬於這個 channel。巢狀的 interface 與 namespace 各自是獨立範圍，也可以各自帶 channel。

`address` 是必填。沒給 `channelId` 時，`channels` map 的 key 就是 address 本身。用 Kafka 這類 broker 時，address 是 topic 名稱，讀者也是用 topic 名稱找 channel。要用別的名稱當 key 時，傳 `channelId`。

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

`messages` map 來自這個 channel 的 operation。emitter 會走訪每個頂層 operation 參數的型別與回傳型別。它會把 union 展開成各個成員，也會取出 array 或 record 的元素型別。帶 [`@message`](./messages#message) 的 model 成為一筆項目。走訪不進入 model 的屬性，因為巢狀的 model 屬於 payload 資料。收集不到任何 message 的 channel 會回報 [`channel-no-messages`](../diagnostics#channel-no-messages)，且不輸出 `messages` 欄位。

address 在 decorator 執行期就檢查：

- 含 query string 回報 [`invalid-channel-address`](../diagnostics#invalid-channel-address)。AsyncAPI 用 channel binding 表達 query 參數。
- 含 fragment 回報同一個代碼。
- `{}` 不成對或巢狀，回報同一個代碼。
- 名稱超出 `A-Z`、`a-z`、`0-9`、`-`、`_` 的範圍，回報 [`invalid-channel-param-name`](../diagnostics#invalid-channel-param-name)。
- address 為空白回報 [`empty-channel-address`](../diagnostics#empty-channel-address)。

scheme 與 host 不檢查。完整 URL、純路徑片段、純 topic 名稱都是合法的 address。

一個 target 只能套用一次。第二次套用回報 [`duplicate-channel-decorator`](../diagnostics#duplicate-channel-decorator)。

### address 參數

address 可以含 `{name}` 模板。每個名稱由這個 channel 的 operation 的頂層參數宣告。型別帶 `@message` 的參數屬於 message 宣告，不會宣告 address 參數。

```typespec
@channel("orders.{region}.created")
interface OrderChannel {
  publish(
    @doc("下單的地區。")
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
        description: 下單的地區。
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
```

channel 參數不帶型別資訊，值一律是字串。

| Parameter Object 欄位 | TypeSpec 來源                                        |
| --------------------- | ---------------------------------------------------- |
| `enum`                | 字串字面值、字串字面值的 union、字串 enum            |
| `default`             | 該參數的預設值                                       |
| `description`         | `@doc`                                               |
| `examples`            | `@example`                                           |
| `location`            | [`@parameterLocation`](./channels#parameterlocation) |

address 至少含一個模板時才輸出 `parameters` 欄位。這一層會回報五種錯誤：[`missing-channel-param`](../diagnostics#missing-channel-param)、[`unused-channel-param`](../diagnostics#unused-channel-param)、[`non-string-channel-param`](../diagnostics#non-string-channel-param)、[`optional-channel-param`](../diagnostics#optional-channel-param)、[`conflicting-channel-param`](../diagnostics#conflicting-channel-param)。

### 描述欄位

channel 用的描述 decorator 與其他物件相同。`@summary` 填 `title`，`@doc` 填 `description`。`@tag` 與 [`@asyncTag`](./document-info#asynctag) 填 `tags`，合併規則與 message 上相同。[`@externalDocs`](./document-info#externaldocs) 填 `externalDocs`。

AsyncAPI 的 channel 另有 `summary` 欄位。TypeSpec 沒有第三個文字來源，所以 emitter 不會輸出該欄位。

## `@dynamicChannel`

```typespec
extern dec dynamicChannel(target: Interface | Namespace, channelId?: valueof string);
```

宣告一個位址只有在執行期才決定的 channel。輸出的 channel 帶字面值 `address: null`，AsyncAPI 把它讀作「未知」。

沒給 `channelId` 時，`channels` map 的 key 用該 target 的宣告名稱。dynamic channel 沒有 address 可以當 key。

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

dynamic channel 永遠不帶 `parameters`，因為它沒有可以放模板的 address。其餘行為與 `@channel` 相同。

一個 target 只能套用一次，也不能與 `@channel` 併用。兩種錯誤分別回報 [`duplicate-dynamic-channel-decorator`](../diagnostics#duplicate-dynamic-channel-decorator) 與 [`conflicting-channel-decorators`](../diagnostics#conflicting-channel-decorators)。

## `@parameterLocation`

```typespec
extern dec parameterLocation(target: ModelProperty, location: valueof string);
```

設定一個 channel address 參數的 `location`。值是 runtime expression，指出參數值在執行期位於 message 的哪裡。

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

這個運算式的文法與 [`@correlationId`](./messages#correlationid) 相同。開頭是 `$message.header#` 或 `$message.payload#`，後面可以接 JSON Pointer。emitter 只檢查格式。它不檢查該 pointer 是否指到 payload 或 headers schema 宣告過的欄位。超出文法的運算式回報 [`invalid-parameter-location`](../diagnostics#invalid-parameter-location)。

一個屬性只能套用一次。第二次套用回報 [`duplicate-parameter-location-decorator`](../diagnostics#duplicate-parameter-location-decorator)。
