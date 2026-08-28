---
title: "Security"
description: "定義一筆 `components.securitySchemes` 項目。`name` 引數就是該項目的 key。此 decorator 可重複套用。"
---

# Security

## `@securityScheme`

```typespec
extern dec securityScheme(
  target: Namespace,
  name: valueof string,
  scheme: valueof AsyncAPISecurityScheme
);
```

定義一筆 `components.securitySchemes` 項目。`name` 引數就是該項目的 key。此 decorator 可重複套用。

emitter 會跨整個程式收集 scheme。`components` 是整份文件共用的登錄表，所以任何 namespace 上的 scheme 都會進入文件。這一點與 `@server` 不同，emitter 只讀 service namespace 上的 server。

`AsyncAPISecurityScheme` 是每種 scheme 一個 model 的 union。`type` 欄位決定採用哪個 model。各 model 之間不共用欄位，因此型別檢查會擋掉屬於其他種類的欄位。

| `type`                                                                                                                 | 額外欄位                                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `userPassword`、`X509`、`symmetricEncryption`、`asymmetricEncryption`、`plain`、`scramSha256`、`scramSha512`、`gssapi` | 無                                                      |
| `apiKey`                                                                                                               | `in`：`"user"` 或 `"password"`                          |
| `httpApiKey`                                                                                                           | `name`，以及 `in`：`"query"`、`"header"` 或 `"cookie"`  |
| `http`                                                                                                                 | `scheme`；`scheme` 為 `"bearer"` 時另有 `bearerFormat?` |
| `oauth2`                                                                                                               | `flows`、`scopes?`                                      |
| `openIdConnect`                                                                                                        | `openIdConnectUrl`、`scopes?`                           |

每種 scheme 另有選填的 `description`。`type` 的值一律照 AsyncAPI 的拼寫輸出，包含 `X509` 的大寫 X。

`http` 也因為同樣的理由分成兩個 model。AsyncAPI 用另一個物件描述 `bearer` scheme，只有那個物件帶 `bearerFormat`。驗證器會擋掉出現在其他 scheme 旁的這個欄位，所以型別檢查也在同一處擋下。

```typespec
@service(#{ title: "Orders" })
@securityScheme("kafka-scram", #{ type: "scramSha512", description: "SASL/SCRAM over TLS." })
@securityScheme("api-key", #{ type: "httpApiKey", name: "X-Api-Key", in: "header" })
namespace Orders;
```

```yaml
components:
  securitySchemes:
    kafka-scram:
      type: scramSha512
      description: SASL/SCRAM over TLS.
    api-key:
      type: httpApiKey
      name: X-Api-Key
      in: header
```

`oauth2` scheme 帶一個 OAuth Flows Object。AsyncAPI 把它定義成四個選填具名欄位，不是陣列。

```typespec
model AsyncAPIOAuthFlows {
  implicit?: ImplicitOAuthFlow;
  password?: PasswordOAuthFlow;
  clientCredentials?: ClientCredentialsOAuthFlow;
  authorizationCode?: AuthorizationCodeOAuthFlow;
}

model OAuthFlowBase {
  refreshUrl?: string;
  availableScopes: Record<string>;
}

model ImplicitOAuthFlow {
  ...OAuthFlowBase;
  authorizationUrl?: string;
}

model PasswordOAuthFlow {
  ...OAuthFlowBase;
  tokenUrl?: string;
}

model ClientCredentialsOAuthFlow {
  ...OAuthFlowBase;
  tokenUrl?: string;
}

model AuthorizationCodeOAuthFlow {
  ...OAuthFlowBase;
  authorizationUrl?: string;
  tokenUrl?: string;
}
```

每個 flow 各有自己的 model。AsyncAPI 對每個 flow 要求不同的 URL 組合，也禁止該 flow 用不到的那個 URL。`implicit` 內出現 `tokenUrl`，或 `password`、`clientCredentials` 內出現 `authorizationUrl`，整個 scheme 就不合法。一個 flow 一個 model 把這件事寫進型別，型別檢查因此會擋下 flow 禁止的 URL。

AsyncAPI 把 scope 對照表命名為 `availableScopes`。OpenAPI 對同一份對照表用的名稱是 `scopes`。scheme 本身的 `scopes` 欄位是另一回事，它列出這個 scheme 需要的 scope 名稱，是各 flow `availableScopes` 的子集。

```typespec
@service(#{ title: "Orders" })
@securityScheme("oauth", #{
  type: "oauth2",
  scopes: #["orders:write"],
  flows: #{
    clientCredentials: #{
      tokenUrl: "https://example.com/token",
      availableScopes: #{ `orders:read`: "Read orders", `orders:write`: "Write orders" }
    }
  }
})
namespace Orders;
```

```yaml
components:
  securitySchemes:
    oauth:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://example.com/token
          availableScopes:
            orders:read: Read orders
            orders:write: Write orders
      scopes:
        - orders:write
```

`implicit` 與 `authorizationCode` 需要 `authorizationUrl`。`password`、`clientCredentials`、`authorizationCode` 需要 `tokenUrl`。缺少或空白會回報 [`missing-oauth-flow-url`](../diagnostics#missing-oauth-flow-url) 錯誤，並丟棄該 scheme。`flows` 沒有任何 flow 會回報 [`empty-oauth-flows`](../diagnostics#empty-oauth-flows) 錯誤。

scheme 的每個 URL 都必須是絕對 URL。這涵蓋 `openIdConnectUrl`，以及各 flow 的 `authorizationUrl`、`tokenUrl` 與 `refreshUrl`。AsyncAPI 對這些欄位標了 `uri` 格式，相對路徑（例如 `/token`）會讓 parser 拒絕整份文件。這種值會回報 [`invalid-url`](../diagnostics#invalid-url) 錯誤，並丟棄該 scheme。

`scopes` 的空白項目會回報 [`blank-security-scope-name`](../diagnostics#blank-security-scope-name) 警告，並丟棄。scheme 本身保留。`availableScopes` 內的空白說明會保留成空字串，因為 AsyncAPI 規定該 map 的每個 key 都要有值。

`scopes` 裡的名稱必須出現在某個 flow 的 `availableScopes`。否則會回報 [`unknown-oauth-scope`](../diagnostics#unknown-oauth-scope)。該名稱仍會寫進文件。

scheme 名稱只能使用英文字母、數字、`.`、`-` 與 `_`。其他名稱會回報 [`invalid-security-scheme-name`](../diagnostics#invalid-security-scheme-name) 錯誤。兩個 scheme 同名會回報 [`duplicate-security-scheme-name`](../diagnostics#duplicate-security-scheme-name) 錯誤，保留原始碼中較前面的那個。必填字串欄位空白會回報 [`empty-security-scheme-field`](../diagnostics#empty-security-scheme-field) 錯誤。

## `@useSecurity`

```typespec
extern dec useSecurity(target: Namespace | Operation, schemeName: valueof string);
```

要求套用一個 security scheme。此 decorator 可重複套用。標在 namespace 上時，每次標記在該 namespace 所有 server 的 `security` 陣列各加一筆。標在 operation 上時，每次標記在該 operation 的 `security` 陣列加一筆。

AsyncAPI 把該陣列讀成 OR。用戶端滿足其中一個 scheme 即可，不必全部滿足。

```typespec
@service(#{ title: "Orders" })
@securityScheme("kafka-scram", #{ type: "scramSha512" })
@useSecurity("kafka-scram")
@server("production", #{ host: "kafka.example.com:9092", protocol: "kafka-secure" })
@server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka-secure" })
namespace Orders;
```

```yaml
servers:
  production:
    host: kafka.example.com:9092
    protocol: kafka-secure
    security:
      - $ref: "#/components/securitySchemes/kafka-scram"
  sit:
    host: kafka.sit.example.com:9092
    protocol: kafka-secure
    security:
      - $ref: "#/components/securitySchemes/kafka-scram"
```

輸出一律是指向 `components.securitySchemes` 的 `$ref`。AsyncAPI 也允許在該處內嵌 scheme，本 emitter 不輸出這種形式。

scheme 名稱的字元集與 `@securityScheme` 的名稱相同：英文字母、數字、`.`、`-` 與 `_`。名稱會寫進 JSON Pointer，字元集以外的字元會讓 pointer 格式錯誤。其他名稱會回報 [`invalid-security-scheme-name`](../diagnostics#invalid-security-scheme-name) 錯誤，並丟棄該次標記。

名稱照原文使用，前後空白不會被移除。`@securityScheme` 對自己的名稱也是同樣處理。所以帶空白的名稱在兩邊都會被拒絕。

emitter 也會檢查名稱是否存在。名稱若沒有任何 `@securityScheme` 定義過，產生的 `$ref` 會指向文件裡不存在的 key。AsyncAPI parser 會因此拒絕整份文件。這種項目會回報 [`undeclared-security-scheme`](../diagnostics#undeclared-security-scheme) 警告，並被丟棄。若某個 server 的項目全部被丟棄，該 server 不會有 `security` 欄位。

operation 層級的 security 是疊加的。它不會取代 server 的設定。operation 上的陣列只放該 operation 指名的 scheme。emitter 不會把 server 的 scheme 複製進來。用戶端要同時滿足 server 的陣列與 operation 的陣列。

```typespec
@channel("orders.created")
interface OrderChannel {
  @send
  @useSecurity("op-token")
  op sendOrderCreated(event: OrderCreated): void;
}
```

```yaml
operations:
  sendOrderCreated:
    action: send
    channel:
      $ref: "#/channels/orders.created"
    security:
      - $ref: "#/components/securitySchemes/op-token"
```

沒有指名任何 scheme 的 operation 完全不輸出 `security` 欄位。AsyncAPI 把空陣列讀作「這個 operation 不需要任何 scheme」，所以 emitter 不輸出空陣列。

標在 namespace 上時，`security` 陣列位在 server 物件上。標在沒有 `@server` 的 namespace 上的 `@useSecurity` 不會有任何效果，並回報 [`use-security-outside-server`](../diagnostics#use-security-outside-server) 警告。這個檢查只針對 namespace。operation 有自己的陣列，不會被它回報。
