---
title: "Server"
description: "@server 與 @useServer 的精確簽章。"
---

# Server

## `@server`

```typespec
extern dec server(target: Namespace, name: valueof string, config: valueof AsyncAPIServer);
```

宣告一個應用程式連線的 server。`name` 引數就是該 server 在根層 `servers` map 中的 key。`host` 與 `protocol` 為必填。`protocolVersion`、`pathname`、`title`、`summary`、`description` 為選填。

此 decorator 可重複套用。每次標記各自新增一筆項目。

```typespec
@service(#{ title: "Orders" })
@server("production", #{
  host: "kafka.example.com:9092",
  protocol: "kafka",
  protocolVersion: "3.5.0",
  title: "Production"
})
@server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
namespace Orders;
```

```yaml
servers:
  production:
    host: kafka.example.com:9092
    protocol: kafka
    protocolVersion: 3.5.0
    title: Production
  sit:
    host: kafka.sit.example.com:9092
    protocol: kafka
```

emitter 只讀 service namespace 上的 server。標在其他 namespace 的 `@server` 會被丟棄，並回報 [`server-outside-service`](../diagnostics#server-outside-service) 警告。

server 的順序依原始碼撰寫順序。順序取自原始碼位置，不取自 decorator 的執行順序。因此疊加的 `@server` 與 augment 的 `@@server` 會一起排序。

每個字串欄位都會 trim。必填欄位 trim 後為空，該 server 被丟棄並回報 [`empty-server-field`](../diagnostics#empty-server-field) 錯誤。選填欄位 trim 後為空，視同未給，不會輸出。

server 名稱只能使用英文字母、數字、`_` 與 `-`。其他名稱會回報 [`invalid-server-name`](../diagnostics#invalid-server-name) 錯誤。emitter 絕不自動改名。兩個 server 同名會回報 [`duplicate-server-name`](../diagnostics#duplicate-server-name) 錯誤，保留原始碼中較前面的那個。

### Server variables

`host` 與 `pathname` 都可以含 `{var}` 模板。config 的 `variables` 欄位為每個名稱給出一個 Server Variable Object。

```typespec
model AsyncAPIServerVariable {
  `enum`?: string[];
  default?: string;
  description?: string;
  examples?: string[];
}
```

AsyncAPI 與 OpenAPI 3 不同，不要求 `default`。`enum` 是 TypeSpec 關鍵字，所以要寫成 `` `enum` ``。

```typespec
@service(#{ title: "Orders" })
@server("broker", #{
  host: "{env}.kafka.example.com:9092",
  protocol: "kafka",
  pathname: "/{tenant}",
  variables: #{
    env: #{ default: "prod", `enum`: #["prod", "sit"], description: "The environment." },
    tenant: #{ default: "acme" }
  }
})
namespace Orders;
```

```yaml
servers:
  broker:
    host: "{env}.kafka.example.com:9092"
    protocol: kafka
    pathname: /{tenant}
    variables:
      env:
        enum:
          - prod
          - sit
        default: prod
        description: The environment.
      tenant:
        default: acme
```

`host` 與 `pathname` 的模板名稱合起來視為同一組。模板沒有對應項目時回報 [`undeclared-server-variable`](../diagnostics#undeclared-server-variable) 警告。該 server 仍會輸出，模板文字保持原樣。宣告了卻沒有模板使用的項目回報 [`unused-server-variable`](../diagnostics#unused-server-variable) 警告，該項目仍會輸出。`default` 不在同一個變數的 `enum` 內時，回報 [`server-variable-default-not-in-enum`](../diagnostics#server-variable-default-not-in-enum) 警告。`enum` 或 `examples` 的空白項目會回報 [`blank-server-variable-value`](../diagnostics#blank-server-variable-value) 警告，並丟棄。整個列表都沒有項目留下時，該欄位一併丟棄。

## `@useServer`

```typespec
extern dec useServer(target: Interface | Namespace, name: valueof string);
```

限定這個 channel 可以在哪些 server 上使用。輸出的 `servers` 是指向根層 `servers` map 的參照陣列。AsyncAPI 規定這裡必須是 Reference Object，所以 Server Object 不會內嵌。

這個 decorator 可重複套用。每次套用加一個參照，參照保持原始碼順序。

```typespec
@service(#{ title: "Orders" })
@server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
@server("kafka-dr", #{ host: "kafka.dr.example.com:9092", protocol: "kafka" })
namespace Orders;

@channel("orders.created")
@useServer("kafka-prod")
@useServer("kafka-dr")
interface OrderChannel {
  publish(event: OrderCreated): void;
}
```

```yaml
channels:
  orders.created:
    address: orders.created
    servers:
      - $ref: "#/servers/kafka-prod"
      - $ref: "#/servers/kafka-dr"
```

沒有任何 `@useServer` 的 channel 完全不輸出 `servers` 欄位。AsyncAPI 把「欄位缺席」與「空陣列」都讀作「在所有 server 上可用」，所以 emitter 直接省略該欄位。

名稱不會與已宣告的 server 對照檢查。名稱打錯會產生指向不存在 server 的參照。另有兩種錯誤會回報：[`duplicate-use-server`](../diagnostics#duplicate-use-server) 與 [`use-server-without-channel`](../diagnostics#use-server-without-channel)。
