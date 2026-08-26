---
title: "HTTP"
description: "HTTP binding。輸出的成員是 `http`，每個物件都帶 `bindingVersion: 0.3.0`。"
---

# HTTP

HTTP binding。輸出的成員是 `http`，每個物件都帶 `bindingVersion: 0.3.0`。

## `@httpOperation`

```typespec
extern dec httpOperation(target: Operation, config: valueof AsyncAPIHttpOperationBinding);
```

| 欄位     | 型別      | 必填 |
| -------- | --------- | ---- |
| `method` | `string`  | 否   |
| `query`  | `unknown` | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`method` 是 `GET`、`PUT`、`POST`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`、`CONNECT`、`TRACE` 其中之一。

`query` 是型別為 `object` 且帶 `properties` 鍵的 Schema Object。這兩項都是 AsyncAPI 的規定。

```typespec
@send
@httpOperation(#{
  method: "POST",
  query: #{ type: "object", properties: #{ tenant: #{ type: "string" } } }
})
op notify(event: OrderCreated): void;
```

```yaml
operations:
  notify:
    action: send
    channel:
      $ref: "#/channels/webhooks.orders"
    bindings:
      http:
        method: POST
        query:
          type: object
          properties:
            tenant:
              type: string
        bindingVersion: 0.3.0
```

## `@httpMessage`

```typespec
extern dec httpMessage(target: Model, config: valueof AsyncAPIHttpMessageBinding);
```

| 欄位         | 型別      | 必填 |
| ------------ | --------- | ---- |
| `headers`    | `unknown` | 否   |
| `statusCode` | `int32`   | 否   |

套用在同時帶有 `@message` 的 model 上。

`headers` 是型別為 `object` 且帶 `properties` 鍵的 Schema Object。

`statusCode` 是 RFC 9110 的狀態碼，範圍在 100 到 599 之間。AsyncAPI 規定它只適用於被 Operation Reply Object 指名的 message。emitter 不檢查這條規則，因為它跨兩個物件。

```typespec
@message
@httpMessage(#{
  headers: #{ type: "object", properties: #{ `X-Correlation-Id`: #{ type: "string" } } },
  statusCode: 202
})
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      payload:
        $ref: "#/components/schemas/OrderCreated"
      bindings:
        http:
          headers:
            type: object
            properties:
              X-Correlation-Id:
                type: string
          statusCode: 202
          bindingVersion: 0.3.0
```
