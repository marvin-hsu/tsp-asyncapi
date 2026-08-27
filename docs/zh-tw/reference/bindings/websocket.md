---
title: "WebSocket"
description: "WebSocket binding。輸出的成員是 `ws`，每個物件都帶 `bindingVersion: 0.1.0`。"
---

# WebSocket

WebSocket binding。輸出的成員是 `ws`，每個物件都帶 `bindingVersion: 0.1.0`。

## `@websocketChannel`

```typespec
extern dec websocketChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIWebSocketChannelBinding
);
```

| 欄位      | 型別      | 必填 |
| --------- | --------- | ---- |
| `method`  | `string`  | 否   |
| `query`   | `unknown` | 否   |
| `headers` | `unknown` | 否   |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

`method` 是開啟連線的 HTTP method。AsyncAPI 只允許 `GET` 與 `POST`。其他值會透過 `invalid-binding-field` 回報。該欄位被丟棄，binding 的其餘部分保留。

`query` 與 `headers` 描述交握。兩者都是 Schema Object。寫成物件字面值，型別為 `object`，並帶 `properties` 鍵。這兩項都是 AsyncAPI 的規定。兩者皆不符的 schema 沒有描述任何參數，emitter 會回報並丟棄該欄位。`$ref` 不需要這兩個鍵，因為它指向的 schema 在別處。

WebSocket binding 沒有 server、operation 與 message 物件。規格明訂這三者不得帶任何屬性。所以 `@websocketChannel` 就是這個通訊協定的全部。

```typespec
@websocketChannel(#{
  method: "GET",
  query: #{ type: "object", properties: #{ token: #{ type: "string" } } }
})
@channel("/ticks")
interface TickStream {
  @send
  op publish(event: Tick): void;
}
```

```yaml
channels:
  /ticks:
    address: /ticks
    bindings:
      ws:
        method: GET
        query:
          type: object
          properties:
            token:
              type: string
        bindingVersion: 0.1.0
```
