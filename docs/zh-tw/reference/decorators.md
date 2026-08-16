# Decorator

本頁列出這個 library 宣告的所有 decorator 的精確簽章，以及 emitter 會讀取的 compiler 內建 decorator。`import "tsp-asyncapi";` 加 `using AsyncAPI;` 之後即可使用。

## `@info`

```typespec
extern dec info(target: Namespace, info: valueof AsyncAPIInfo);
```

填入 service namespace 的 AsyncAPI `info` 區塊。參數的形狀：

| 欄位             | 型別                      | 必填 |
| ---------------- | ------------------------- | ---- |
| `version`        | `string`                  | 是   |
| `description`    | `string`                  | 否   |
| `termsOfService` | `string`                  | 否   |
| `contact`        | `{ name?, url?, email? }` | 否   |
| `license`        | `{ name, url? }`          | 否   |

```typespec
@service(#{ title: "Order Service API" })
@info(#{
  version: "1.0.0",
  description: "Order events.",
  contact: #{ name: "API Support", email: "support@example.com" },
  license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
})
namespace Orders;
```

```yaml
info:
  title: Order Service API
  version: 1.0.0
  description: Order events.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
```

沒有 `@info` 時，`info.version` 後備為 `0.0.0`。若 `@info` 沒給 `description`，改用 namespace 上的 `@doc`（或 `/** ... */` 文件註解）。

## `@server`

```typespec
extern dec server(target: Namespace, name: valueof string, config: valueof AsyncAPIServer);
```

宣告一個應用程式連線的 server。`name` 引數就是該 server 在根層 `servers` map 中的 key。`host` 與 `protocol` 為必填。`protocolVersion`、`pathname`、`title`、`summary`、`description` 為選填。

此 decorator 可重複標記。每次標記各自新增一筆項目。

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

emitter 只讀 service namespace 上的 server。標在其他 namespace 的 `@server` 會被丟棄，並發出 [`server-outside-service`](./diagnostics#server-outside-service) 警告。

server 的順序依原始碼撰寫順序。順序取自原始碼位置，不取自 decorator 的執行順序。因此疊加的 `@server` 與 augment 的 `@@server` 會一起排序。

每個字串欄位都會 trim。必填欄位 trim 後為空，該 server 被丟棄並發出 [`empty-server-field`](./diagnostics#empty-server-field) 錯誤。選填欄位 trim 後為空，視同未給，不會輸出。

server 名稱只能使用英文字母、數字、`_` 與 `-`。其他名稱會發出 [`invalid-server-name`](./diagnostics#invalid-server-name) 錯誤。emitter 絕不自動改名。兩個 server 同名會發出 [`duplicate-server-name`](./diagnostics#duplicate-server-name) 錯誤，保留原始碼中較前面的那個。

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

所有欄位皆為選填。AsyncAPI 與 OpenAPI 3 不同，不要求 `default`。`enum` 是 TypeSpec 關鍵字，所以要寫成 `` `enum` ``。

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

`host` 與 `pathname` 的模板名稱合起來視為同一組。模板沒有對應項目時發出 [`undeclared-server-variable`](./diagnostics#undeclared-server-variable) 警告。該 server 仍會輸出，模板文字保持原樣。宣告了卻沒有模板使用的項目發出 [`unused-server-variable`](./diagnostics#unused-server-variable) 警告，該項目仍會輸出。`default` 不在同一個變數的 `enum` 內時，發出 [`server-variable-default-not-in-enum`](./diagnostics#server-variable-default-not-in-enum) 警告。`enum` 或 `examples` 的空白項目沒有指出任何值，會被丟棄，並發出 [`blank-server-variable-value`](./diagnostics#blank-server-variable-value) 警告。整個列表都沒有項目留下時，該欄位一併丟棄。

## `@securityScheme`

```typespec
extern dec securityScheme(
  target: Namespace,
  name: valueof string,
  scheme: valueof AsyncAPISecurityScheme
);
```

定義一筆 `components.securitySchemes` 項目。`name` 引數就是該項目的 key。此 decorator 可重複標記。

scheme 是跨整個程式收集的。`components` 是整份文件共用的登錄表，所以任何 namespace 上的 scheme 都會進入文件。這一點與 `@server` 不同，emitter 只讀 service namespace 上的 server。

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

`apiKey` 與 `httpApiKey` 刻意分成兩個 model。兩者的 `in` 值域不同，而 `name` 只屬於 `httpApiKey`。

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

`implicit` 與 `authorizationCode` 需要 `authorizationUrl`。`password`、`clientCredentials`、`authorizationCode` 需要 `tokenUrl`。缺少或空白會發出 [`missing-oauth-flow-url`](./diagnostics#missing-oauth-flow-url) 錯誤，並丟棄該 scheme。`flows` 沒有任何 flow 會發出 [`empty-oauth-flows`](./diagnostics#empty-oauth-flows) 錯誤。

scheme 的每個 URL 都必須是絕對 URL。這涵蓋 `openIdConnectUrl`，以及各 flow 的 `authorizationUrl`、`tokenUrl` 與 `refreshUrl`。AsyncAPI 對這些欄位標了 `uri` 格式，相對路徑（例如 `/token`）會讓 parser 拒絕整份文件。這種值會發出 [`invalid-url`](./diagnostics#invalid-url) 錯誤，並丟棄該 scheme。

`scopes` 的空白項目沒有指出任何 scope，會被丟棄，並發出 [`blank-security-scope-name`](./diagnostics#blank-security-scope-name) 警告。scheme 本身保留。`availableScopes` 內的空白說明會保留成空字串，因為 AsyncAPI 要求該 map 的每個 key 都要有值。

scheme 名稱只能使用英文字母、數字、`.`、`-` 與 `_`。其他名稱會發出 [`invalid-security-scheme-name`](./diagnostics#invalid-security-scheme-name) 錯誤。兩個 scheme 同名會發出 [`duplicate-security-scheme-name`](./diagnostics#duplicate-security-scheme-name) 錯誤，保留原始碼中較前面的那個。必填字串欄位空白會發出 [`empty-security-scheme-field`](./diagnostics#empty-security-scheme-field) 錯誤。

## `@useSecurity`

```typespec
extern dec useSecurity(target: Namespace | Operation, schemeName: valueof string);
```

要求套用一個 security scheme。此 decorator 可重複標記。標在 namespace 上時，每次標記在該 namespace 所有 server 的 `security` 陣列各加一筆。標在 operation 上時，每次標記在該 operation 的 `security` 陣列加一筆。

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

scheme 名稱的字元集與 `@securityScheme` 的名稱相同：英文字母、數字、`.`、`-` 與 `_`。名稱會寫進 JSON Pointer，字元集以外的字元會讓 pointer 格式錯誤。其他名稱會發出 [`invalid-security-scheme-name`](./diagnostics#invalid-security-scheme-name) 錯誤，並丟棄該次標記。

名稱照原文使用，前後空白不會被移除。`@securityScheme` 對自己的名稱也是同樣處理。所以帶空白的名稱在兩邊都會被拒絕。

emitter 也會檢查名稱是否存在。沒有任何 `@securityScheme` 定義的名稱，會產生指向文件中不存在的 key 的 `$ref`。AsyncAPI parser 會因此拒絕整份文件。這種項目會發出 [`undeclared-security-scheme`](./diagnostics#undeclared-security-scheme) 警告，並被丟棄。若某個 server 的項目全部被丟棄，該 server 不會有 `security` 欄位。

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
      $ref: "#/channels/OrderChannel"
    security:
      - $ref: "#/components/securitySchemes/op-token"
```

沒有指名任何 scheme 的 operation 完全不輸出 `security` 欄位。AsyncAPI 把空陣列讀作「這個 operation 不需要任何 scheme」，所以 emitter 不輸出空陣列。

標在 namespace 上時，`security` 陣列位在 server 物件上。標在沒有 `@server` 的 namespace 上的 `@useSecurity` 不會有任何效果，並發出 [`use-security-outside-server`](./diagnostics#use-security-outside-server) 警告。這個檢查只針對 namespace。operation 有自己的陣列，不會被它回報。

## `@externalDocs`

```typespec
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
```

附加外部文件連結。target 宣告為 `unknown`，因為 external docs 可以標在多種位置上。**目前 emitter 讀取兩處：service namespace 上的輸出到 `info.externalDocs`，`@message` model 上的輸出到該 message 的 `externalDocs`。** 標在其他位置會記錄下來，但還不會輸出。

標有 `@server` 的 namespace 也會把該連結放到它宣告的每個 server 上。server 來自 service namespace，而 `info` 讀的是同一個 namespace，所以連結會出現在兩處。AsyncAPI 在兩種物件上都定義了 `externalDocs`。

`url` 必須是絕對 URL。AsyncAPI 對這個欄位標了 `uri` 格式，相對路徑（例如 `/docs`）會讓 parser 拒絕整份文件。url 不是絕對 URL 時，emitter 回報 [`invalid-url`](./diagnostics#invalid-url) 錯誤，並丟棄這次標記。

```typespec
@externalDocs("https://example.com/docs", "Service Documentation")
namespace Orders;
```

```yaml
info:
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
```

```typespec
@message
@externalDocs("https://example.com/order-created", "How to consume this message.")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      externalDocs:
        url: https://example.com/order-created
        description: How to consume this message.
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

## `@asyncTag`

```typespec
extern dec asyncTag(target: unknown, name: valueof string, metadata?: valueof AsyncAPITag);

model AsyncAPITag {
  description?: string;
  externalDocs?: ExternalDocs;
}

model ExternalDocs {
  url: string;
  description?: string;
}
```

在輸出的物件上加一個 tag 與它的 metadata。可重複套用：每次套用加一個 tag，輸出的陣列依原始碼順序排列。

名字刻意取為 `asyncTag` 而非 `tag`。內建的 `@tag` 位於全域的 `TypeSpec` namespace，永遠在可見範圍內。若在 `AsyncAPI` namespace 再放一個 `tag`，使用者寫 `using AsyncAPI;` 之後的 `@tag(...)` 就會變成有歧義的識別字，既有的 `@tag` 全部得改寫成 `@TypeSpec.tag(...)`。

它與內建 `@tag` 有兩點不同：

|        | 內建 `@tag`                           | `@asyncTag`                              |
| ------ | ------------------------------------- | ---------------------------------------- |
| 參數   | 只有名字                              | 名字加上 `description` 與 `externalDocs` |
| target | `Namespace \| Interface \| Operation` | 任何型別，包含 `Model`                   |

AsyncAPI 的每個項目放的是完整的 Tag Object，OpenAPI 放的是單純的字串。message 是 model，所以**內建 `@tag` 根本標不到 message 上**，編譯器會直接拒絕該次套用。

```typespec
@message
@asyncTag("orders", #{
  description: "Everything about orders.",
  externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
})
@asyncTag("public")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      tags:
        - name: orders
          description: Everything about orders.
          externalDocs:
            url: https://example.com/orders
            description: The order guide.
        - name: public
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

emitter 目前會在 service namespace（輸出到 `info.tags`）與 message 上讀取它。標在其他位置會記錄下來，但還不會輸出。

名稱不可為空字串。AsyncAPI Tag Object 的 `name` 是必填欄位，空白的名稱沒有任何 consumer 比對得到。所以 `@asyncTag("")` 回報 [`empty-tag-name`](./diagnostics#empty-tag-name)，該 tag 被丟棄。

### 合併規則

同一個物件上，一個名字只會輸出一個 Tag Object。同一個 target 上兩次套用指到同一個名字時，逐欄位合併：

- **內建 `@tag` 與 `@asyncTag` 同名。** 合併，以 metadata 為準。內建 decorator 只帶名字，沒有任何可以互相牴觸的內容。
- **兩個 `@asyncTag` 同名、各自設定不同欄位。** 合併。一邊的 `description` 與另一邊的 `externalDocs` 組成同一個 Tag Object。
- **兩個 `@asyncTag` 同名、同一個欄位給了兩個不同的值。** 這是 [`conflicting-tag-metadata`](./diagnostics#conflicting-tag-metadata) error。該欄位保留原始碼順序中第一次套用的值。

同一個名字出現在**兩個不同的 target** 上、帶不同的 metadata，不算錯誤。AsyncAPI 讓每個物件各自持有獨立的 `tags` 陣列。

## `@oneOf`

```typespec
extern dec oneOf(target: Union);
```

標註在 union 上，輸出 `oneOf`（恰好一個 variant 成立）取代預設的 `anyOf`（至少一個成立）。在 [schema 轉換層](../guide/schema-conversion#union)生效：

```typespec
@oneOf
union Shape {
  circle: Circle,
  square: Square,
}
```

```yaml
Shape:
  oneOf:
    - $ref: "#/components/schemas/Circle"
    - $ref: "#/components/schemas/Square"
```

## `@message`

```typespec
extern dec message(target: Model, name?: valueof string);
```

把一個 model 標記為 AsyncAPI message。每個被標記的 model 會成為 `components.messages` 的一筆，其 `payload` 指向該 model 的 schema。

target 必須是 `Model`。payload 只是單一 scalar 的訊息，必須把該 scalar 包進一個 model 裡。

```typespec
@message
model OrderCreated {
  orderId: string;
  amount: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      payload:
        $ref: "#/components/schemas/OrderCreated"
  schemas:
    OrderCreated:
      type: object
      properties:
        orderId:
          type: string
        amount:
          type: number
          format: double
      required:
        - orderId
        - amount
```

選填參數可覆寫 key：

```typespec
@message("order.created.v1")
model OrderCreated {
  orderId: string;
}
```

兩點要注意：

- **只有被觸及的 model 會輸出**。`components.schemas` 只收 message 能觸及的 model（直接引用或透過屬性間接引用）。沒有任何 message 引用到的 model 不會出現。
- **message key 不帶 namespace 前綴，schema key 會帶**。`namespace Sales` 裡的 `@message model Ev` 會產出 message key `Ev` 與 schema key `Sales.Ev`。當某個 message key 剛好等於另一個型別的 schema key 時，emitter 會回報 [`message-key-shadows-schema-key`](./diagnostics#message-key-shadows-schema-key)。

## `@contentType`

```typespec
extern dec contentType(target: Model, contentType: valueof string);
```

設定 message payload 的媒體型態（media type）。沒有標記時不輸出這個欄位，改由文件層級的 `defaultContentType` 生效。

```typespec
@message
@contentType("application/avro")
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      contentType: application/avro
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

emitter 原樣輸出這個字串。它不解析媒體型態，也不會因此改變 payload schema。

每個 model 只套用一次。一個 message 只有一個 content type，所以第二次套用回報 [`duplicate-content-type-decorator`](./diagnostics#duplicate-content-type-decorator)。

媒體型態不可以是空字串。空白的媒體型態沒有指出任何格式。emitter 回報 [`empty-content-type`](./diagnostics#empty-content-type) 並丟棄這次套用。這個 message 接著退回文件層級的 `defaultContentType`。

## `@header`

```typespec
extern dec header(target: ModelProperty);
```

把 message model 的一個欄位標記為 message header。emitter 會把每個被標記的欄位從 payload schema 抽出來，集中放進該 message 的 `headers` schema。payload 只留沒有被標記的欄位。

```typespec
@message
model OrderCreated {
  @header
  correlationId: string;

  @header
  retryCount?: int32;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
          retryCount:
            type: integer
            format: int32
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
      required:
        - orderId
```

五點要注意：

- **這個 decorator 不收名稱參數**。`@typespec/http` 的 `@header` 有名稱參數，是因為 HTTP 會把欄位名改寫成 kebab-case。AsyncAPI 的 application headers 沒有這個慣例。若 header 的 key 不是合法的 TypeSpec 識別字，用 [`@encodedName`](#emitter-會讀的內建-decorator) 指定，寫法與改 payload 欄位名相同。
- **只有 `@message` model 的頂層欄位會被抽出**。payload 更深層的標記會回報 [`nested-header-ignored`](./diagnostics#nested-header-ignored)，該欄位留在 payload。headers 本身要有巢狀結構時，改用 `@headers`。
- **`extends` 與 `...` 在這裡行為不同**。展開語法 `...Base` 把屬性複製進 message model，被標記的屬性成為 message 自己的欄位，會被抽出。`extends Base` 則讓屬性留在 base model 上，payload 用 `allOf` 引用它。抽走它會影響所有繼承同一個 base 的 model，所以 emitter 保留該欄位並回報 [`inherited-header-ignored`](./diagnostics#inherited-header-ignored)。
- **payload 會拿到自己的一份 component**。抽出只影響宣告 header 的那個 message。model 自己的 `components.schemas` 項目保留全部欄位，所以 subtype、其他 message 的欄位型別，以及任何其他讀取者，看到的都是完整結構。message 指向第二份 component，key 是 `<Model>Payload`，裡面只有留下來的欄位。若你自己已經宣告了名為 `<Model>Payload` 的 model，emitter 回報 [`duplicate-schema-key`](./diagnostics#duplicate-schema-key)，該 message 退回指向 model 自己的 component。
- **名為 `content-type` 的 header 欄位會與 `@contentType` 衝突**。AsyncAPI 只有一個欄位表示 content type，所以 emitter 回報 [`content-type-header-conflict`](./diagnostics#content-type-header-conflict)，不自行挑一個來源。

## `@headers`

```typespec
extern dec headers(target: Model, headers: Model);
```

用一個獨立的 model 設定整個 message 的 `headers` schema。headers 自成一個 model、或 headers 需要巢狀結構時用它。emitter 會把該 model 輸出到 `components.schemas` 並以 `$ref` 引用，所以多個 message 可以共用同一份 headers 定義。

```typespec
model MqmdFields {
  CorrelId: string;
}

model ShippingHeaders {
  MQMD: MqmdFields;
}

@message
@headers(ShippingHeaders)
model OrderShipped {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderShipped:
      name: OrderShipped
      headers:
        $ref: "#/components/schemas/ShippingHeaders"
      payload:
        $ref: "#/components/schemas/OrderShipped"
```

這個 model 必須是 object 型態。AsyncAPI 要求 headers schema 描述一組 key/value map，所以 array 為底的 model 會回報 [`headers-not-object`](./diagnostics#headers-not-object)。

同一個 message 不要同時用欄位層級的 `@header`。兩個來源沒有明確的優先序，所以 emitter 回報 [`duplicate-message-headers`](./diagnostics#duplicate-message-headers)，且兩邊都不輸出。

headers model 上名為 `content-type` 的屬性，與 message 上的 `@contentType` 衝突，情形和欄位層級的同名 `@header` 相同。emitter 回報 [`content-type-header-conflict`](./diagnostics#content-type-header-conflict)。headers model 繼承來的屬性也會檢查。

## `@correlationId`

```typespec
extern dec correlationId(target: Model, location: valueof string, description?: valueof string);
```

設定 message 的 `correlationId`。`location` 是 runtime expression，指出關聯值在執行期的位置。

```typespec
@message
@correlationId("$message.header#/correlationId", "把回覆與原請求關聯起來。")
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
      correlationId:
        location: "$message.header#/correlationId"
        description: 把回覆與原請求關聯起來。
```

合法的 `location` 是 `$message.header#` 或 `$message.payload#`，後面可再接一段 JSON Pointer。下列都合法：

| Location                         | 意義                 |
| -------------------------------- | -------------------- |
| `$message.header#`               | headers 物件本身     |
| `$message.header#/correlationId` | 單一 header          |
| `$message.header#/MQMD/CorrelId` | 巢狀兩層的 header    |
| `$message.payload#/order/id`     | payload 內巢狀的欄位 |

`#` 是必要的。規格的 ABNF 條文看起來像是可以省略，但規格的正規 JSON Schema 要求它，官方 AsyncAPI parser 也會拒絕帶有 `$message.header`（不含 `#`）的文件。

其他寫法回報 [`invalid-correlation-id-location`](./diagnostics#invalid-correlation-id-location)，且不輸出 `correlationId`。

emitter 只檢查格式。它不檢查該 pointer 是否指向 headers 或 payload schema 已宣告的欄位。規格沒有這項要求，官方範例本身也指向 schema 未定義的路徑。

每個 model 只套用一次。第二次套用回報 [`duplicate-correlation-id-decorator`](./diagnostics#duplicate-correlation-id-decorator)。

## `@messageExample`

```typespec
extern dec messageExample(
  target: Model,
  example: valueof MessageExampleValue,
  options?: valueof MessageExampleOptions
);
```

為 message 加上一筆範例。參數形狀：

| 欄位              | 型別              | 必填 |
| ----------------- | ----------------- | ---- |
| `example.headers` | `Record<unknown>` | 否   |
| `example.payload` | `unknown`         | 否   |
| `options.name`    | `string`          | 否   |
| `options.summary` | `string`          | 否   |

`headers` 是一組 key/value map，因為 AsyncAPI Message Example Object 把它定義為 `Map[string, any]`。`payload` 則是自由格式，規格把它定義為 `any`，所以純量 payload 也合法。

可重複套用：每次套用在 `examples` 陣列加一筆，順序照原始碼順序。AsyncAPI 的 `examples` 是陣列，所以一個 message 可以列出多種情境，每筆各有自己的 `name`。

```typespec
@message
@messageExample(
  #{ headers: #{ correlationId: "abc-123" }, payload: #{ orderId: "o-1", total: 12.5 } },
  #{ name: "smallOrder", summary: "單一品項，已付款。" }
)
@messageExample(#{ payload: #{ orderId: "o-2", total: 999.0 } }, #{ name: "largeOrder" })
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
  total: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      examples:
        - name: smallOrder
          summary: 單一品項，已付款。
          headers:
            correlationId: abc-123
          payload:
            orderId: o-1
            total: 12.5
        - name: largeOrder
          payload:
            orderId: o-2
            total: 999
```

兩點要知道：

- **每筆範例至少要有 `headers` 或 `payload` 其中之一。** 兩者皆無的範例說明不了任何事，會回報 [`empty-message-example`](./diagnostics#empty-message-example) 並捨棄該筆。
- **範例內容不會與 message schema 對照檢查。** 值照寫的原樣輸出。若某個值無法序列化為 JSON（例如自訂 scalar 的建構式），該筆整筆捨棄，並回報 [`unserializable-message-example`](./diagnostics#unserializable-message-example)。

## `@jsonSchemaExtension`

```typespec
extern dec jsonSchemaExtension(target: Model | ModelProperty, key: valueof string, value: valueof unknown);
```

在目標的輸出 schema 加一組原始 key/value。這是沒有專屬 decorator 時的逃生口。可重複套用，每次加一組。extension key 會蓋過 emitter 自己產生的同名關鍵字。

```typespec
@jsonSchemaExtension("unevaluatedProperties", false)
model Strict {
  id: string;
}
```

```yaml
Strict:
  type: object
  properties:
    id:
      type: string
  required:
    - id
  unevaluatedProperties: false
```

## `@channel`

```typespec
extern dec channel(target: Interface | Namespace, address: valueof string, channelId?: valueof string);
```

宣告一個 channel。這個 channel 擁有直接寫在該 interface 或 namespace 裡的 operation。巢狀的 interface 與巢狀的 namespace 是各自獨立的範圍。它們可以各自帶自己的 channel。

`address` 是必填。沒給 `channelId` 時，`channels` map 的 key 用該 target 的宣告名稱。

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
  OrderChannel:
    address: orders.created
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
```

`messages` map 來自這個 channel 的 operation。emitter 會走訪每個頂層 operation 參數的型別與回傳型別。它會把 union 展開成各個成員，也會取出 array 或 record 的元素型別。帶 [`@message`](#message) 的 model 成為一筆項目。走訪不進入 model 的屬性，因為巢狀的 model 屬於 payload 資料。收集不到任何 message 的 channel 會回報 [`channel-no-messages`](./diagnostics#channel-no-messages)，且不輸出 `messages` 欄位。

address 在 decorator 執行期就檢查：

- 含 query string 回報 [`invalid-channel-address`](./diagnostics#invalid-channel-address)。AsyncAPI 用 channel binding 表達 query 參數。
- 含 fragment 回報同一個代碼。
- `{}` 不成對或巢狀，回報同一個代碼。
- 名稱超出 `A-Z`、`a-z`、`0-9`、`-`、`_` 的範圍，回報 [`invalid-channel-param-name`](./diagnostics#invalid-channel-param-name)。
- address 為空白回報 [`empty-channel-address`](./diagnostics#empty-channel-address)。

scheme 與 host 不檢查。完整 URL、純路徑片段、純 topic 名稱都是合法的 address。

一個 target 只能套用一次。第二次套用回報 [`duplicate-channel-decorator`](./diagnostics#duplicate-channel-decorator)。

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
  OrderChannel:
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

AsyncAPI Parameter Object 只有五個欄位，**沒有 `schema`**。所以 channel 參數不帶型別資訊，值一律是字串。

| Parameter Object 欄位 | TypeSpec 來源                              |
| --------------------- | ------------------------------------------ |
| `enum`                | 字串字面值、字串字面值的 union、字串 enum  |
| `default`             | 該參數的預設值                             |
| `description`         | `@doc`                                     |
| `examples`            | `@example`                                 |
| `location`            | [`@parameterLocation`](#parameterlocation) |

address 至少含一個模板時才輸出 `parameters` 欄位。這一層會回報五種錯誤：[`missing-channel-param`](./diagnostics#missing-channel-param)、[`unused-channel-param`](./diagnostics#unused-channel-param)、[`non-string-channel-param`](./diagnostics#non-string-channel-param)、[`optional-channel-param`](./diagnostics#optional-channel-param)、[`conflicting-channel-param`](./diagnostics#conflicting-channel-param)。

### 描述欄位

channel 用的描述 decorator 與其他物件相同。`@summary` 填 `title`，`@doc` 填 `description`。`@tag` 與 [`@asyncTag`](#asynctag) 填 `tags`，合併規則與 message 上相同。[`@externalDocs`](#externaldocs) 填 `externalDocs`。

AsyncAPI 的 channel 另有 `summary` 欄位。TypeSpec 沒有第三個文字來源，所以 emitter 不會輸出該欄位。

## `@dynamicChannel`

```typespec
extern dec dynamicChannel(target: Interface | Namespace, channelId?: valueof string);
```

宣告一個位址只有在執行期才決定的 channel。輸出的 channel 帶字面值 `address: null`，AsyncAPI 把它讀作「未知」。

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

這是獨立的 decorator，不是「省略 address 的 `@channel`」。位址未知的 channel 在語意上是另一種 channel。兩個 decorator 分開，「刻意要 null」與「忘記寫 address」才能在語法上區分。

dynamic channel 永遠不帶 `parameters`，因為它沒有可以放模板的 address。其餘行為與 `@channel` 相同。

一個 target 只能套用一次，也不能與 `@channel` 併用。兩種錯誤分別回報 [`duplicate-dynamic-channel-decorator`](./diagnostics#duplicate-dynamic-channel-decorator) 與 [`conflicting-channel-decorators`](./diagnostics#conflicting-channel-decorators)。

## `@useServer`

```typespec
extern dec useServer(target: Interface | Namespace, name: valueof string);
```

限定這個 channel 可以在哪些 server 上使用。輸出的 `servers` 是指向根層 `servers` map 的參照陣列。AsyncAPI 規定這裡必須是 Reference Object，所以 Server Object 不會內聯。

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
  OrderChannel:
    address: orders.created
    servers:
      - $ref: "#/servers/kafka-prod"
      - $ref: "#/servers/kafka-dr"
```

沒有任何 `@useServer` 的 channel 完全不輸出 `servers` 欄位。AsyncAPI 把「欄位缺席」與「空陣列」都讀作「在所有 server 上可用」，所以 emitter 直接省略該欄位。

名稱不會與已宣告的 server 對照檢查。名稱打錯會產生指向不存在 server 的參照。另有兩種錯誤會回報：[`duplicate-use-server`](./diagnostics#duplicate-use-server) 與 [`use-server-without-channel`](./diagnostics#use-server-without-channel)。

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
  UserChannel:
    address: users.{userId}.signedup
    parameters:
      userId:
        location: $message.payload#/user/id
```

這個運算式的文法與 [`@correlationId`](#correlationid) 相同。開頭是 `$message.header#` 或 `$message.payload#`，後面可以接 JSON Pointer。emitter 只檢查格式。它不檢查該 pointer 是否指到 payload 或 headers schema 宣告過的欄位。超出文法的運算式回報 [`invalid-parameter-location`](./diagnostics#invalid-parameter-location)。

一個屬性只能套用一次。第二次套用回報 [`duplicate-parameter-location-decorator`](./diagnostics#duplicate-parameter-location-decorator)。

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

`operationId` 覆寫這個 operation 在輸出 `operations` map 中的 key。不給時，key 是 operation 的名稱。空白的 id 回報 [`empty-operation-id`](./diagnostics#empty-operation-id)。兩個 operation 對應到同一個 key 時回報 [`duplicate-operation-id`](./diagnostics#duplicate-operation-id)，原始碼順序在前的保留該 key。

interface 優先於外層的 namespace。巢狀 interface 是獨立的 channel 範圍。所在範圍沒有 channel 的 operation 回報 [`operation-without-channel`](./diagnostics#operation-without-channel) 並被丟棄。

一個 operation 只能套用一次，也不能與 `@receive` 併用。兩種錯誤分別回報 [`duplicate-send-decorator`](./diagnostics#duplicate-send-decorator) 與 [`conflicting-operation-actions`](./diagnostics#conflicting-operation-actions)。

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

一個 operation 只能套用一次，也不能與 `@send` 併用。兩種錯誤分別回報 [`duplicate-receive-decorator`](./diagnostics#duplicate-receive-decorator) 與 [`conflicting-operation-actions`](./diagnostics#conflicting-operation-actions)。

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

指定的目標必須帶 `@channel` 或 `@dynamicChannel`。沒有 channel 的目標回報 [`reply-channel-not-a-channel`](./diagnostics#reply-channel-not-a-channel)，整個 `reply` 物件被丟棄。

一個 operation 只能套用一次，而且該 operation 要帶 `@send` 或 `@receive`。兩種錯誤分別回報 [`duplicate-reply-channel-decorator`](./diagnostics#duplicate-reply-channel-decorator) 與 [`reply-without-action`](./diagnostics#reply-without-action)。

::: tip
`reply` 不是描述 request/reply 的唯一途徑。一對 `@send` 與 `@receive` operation，再加上每個 message 上的 [`@correlationId`](#correlationid)，可以表達鬆耦合的風格。官方的 `rpc-client` 與 `rpc-server` 範例就是這種寫法。兩種風格都是合法的 AsyncAPI 3。
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

`location` 的文法與 [`@correlationId`](#correlationid) 相同。開頭是 `$message.header#` 或 `$message.payload#`，後面可以接 JSON Pointer。emitter 只檢查格式。超出文法的運算式回報 [`invalid-reply-address-location`](./diagnostics#invalid-reply-address-location)，並丟棄該次標記。

給了回覆位址時，AsyncAPI 要求回覆 channel 的 address 必須是 `null`。所以那個 channel 要用 [`@dynamicChannel`](#dynamicchannel) 宣告。在帶有 address 的 channel 上給回覆位址會回報 [`reply-address-needs-dynamic-channel`](./diagnostics#reply-address-needs-dynamic-channel)。`address` 從 reply 中被丟棄，reply 的其餘部分保留。

一個 operation 只能套用一次，而且該 operation 要帶 `@send` 或 `@receive`。兩種錯誤分別回報 [`duplicate-reply-address-decorator`](./diagnostics#duplicate-reply-address-decorator) 與 [`reply-without-action`](./diagnostics#reply-without-action)。

## emitter 會讀的內建 decorator

以下來自 `@typespec/compiler`，不需要 import：

| Decorator                                                                                                                                         | 在本 emitter 的效果                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@service(#{ title })`                                                                                                                            | 標記 service namespace。`title` → `info.title`。一份文件一個 service。第二個會警告（[`multiple-services`](./diagnostics#multiple-services)）並忽略。 |
| `@tag("name")`                                                                                                                                    | 每次套用產生一筆 `info.tags`。它標不到 `Model`，message 的 tag 改用 [`@asyncTag`](#asynctag)。兩者指到同一個名字時會合併。                           |
| `@doc` / 文件註解                                                                                                                                 | `description`。在 namespace 上是 `info.description` 的後備。在 schema 層的宣告與屬性上也生效。                                                       |
| `@summary`                                                                                                                                        | schema 的 `title`。                                                                                                                                  |
| `@example(#{...})`                                                                                                                                | schema `examples` 的一個項目，序列化為 JSON。                                                                                                        |
| `@discriminator("prop")`                                                                                                                          | schema 的 `discriminator`。見[繼承](../guide/schema-conversion#繼承與-discriminator)。                                                               |
| `@encodedName("application/json", "wire_name")`                                                                                                   | 改寫 schema 的屬性 key。見 [wire key](../guide/schema-conversion#改寫-wire-key-encodedname)。                                                        |
| `@friendlyName("{name}X", T)`                                                                                                                     | 覆寫宣告的 `components.schemas` key。                                                                                                                |
| `@minLength`、`@maxLength`、`@pattern`、`@format`、`@minValue`、`@maxValue`、`@minValueExclusive`、`@maxValueExclusive`、`@minItems`、`@maxItems` | 驗證關鍵字。見[對應表](../guide/schema-conversion#驗證-decorator)。                                                                                  |

::: tip
schema 層的 decorator（`@oneOf`、`@jsonSchemaExtension` 與形塑 schema 的內建 decorator）目前只在轉換層生效。見 [Schema 轉換](../guide/schema-conversion)開頭的狀態說明。
:::
