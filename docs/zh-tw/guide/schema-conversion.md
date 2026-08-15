# Schema 轉換

本頁是參考文件：說明 emitter 如何把每種 TypeSpec 構件轉換成 [AsyncAPI Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#schemaObject)（JSON Schema draft-07 的超集）。以下每個輸出都由轉換器實際產生，不是手寫的。

::: warning 尚未接進輸出檔
轉換層已實作並有單元測試覆蓋，但**尚未接進 `tsp compile` 的輸出**。目前輸出文件的 `components` 是空的。message payload 落地時會接上（見 [roadmap](https://github.com/marvin-hsu/tsp-asyncapi#roadmap)）。你現在就能依本頁設計 model。接上後，schema 會以本頁所示的樣子出現在 `components.schemas`。
:::

## Model

具名 model 成為 `components.schemas` 的一個項目。使用處以 `$ref` 引用它。選填屬性（`?`）不進 `required`。array 轉成 `type: array`。`Record<T>` 轉成帶 `additionalProperties` 的 `type: object`。

```typespec
model Order {
  id: string;
  amount: float64;
  items: OrderItem[];
  metadata: Record<string>;
  note?: string;
}

model OrderItem {
  productId: string;
  quantity: int32;
}
```

```yaml
components:
  schemas:
    OrderItem:
      type: object
      properties:
        productId:
          type: string
        quantity:
          type: integer
          format: int32
      required:
        - productId
        - quantity
    Order:
      type: object
      properties:
        id:
          type: string
        amount:
          type: number
          format: double
        items:
          type: array
          items:
            $ref: "#/components/schemas/OrderItem"
        metadata:
          type: object
          additionalProperties:
            type: string
        note:
          type: string
      required:
        - id
        - amount
        - items
        - metadata
```

## 內建 scalar

| TypeSpec                                 | `type`    | `format`                                 |
| ---------------------------------------- | --------- | ---------------------------------------- |
| `string`                                 | `string`  | —                                        |
| `boolean`                                | `boolean` | —                                        |
| `integer`                                | `integer` | —（抽象型別，寬度未定）                  |
| `numeric`、`float`                       | `number`  | —（抽象型別，寬度未定）                  |
| `int8` / `int16` / `int32` / `int64`     | `integer` | `int8` / `int16` / `int32` / `int64`     |
| `safeint`                                | `integer` | `int64`                                  |
| `uint8` / `uint16` / `uint32` / `uint64` | `integer` | `uint8` / `uint16` / `uint32` / `uint64` |
| `float32`                                | `number`  | `float`                                  |
| `float64`                                | `number`  | `double`                                 |
| `decimal`                                | `number`  | `decimal`                                |
| `decimal128`                             | `number`  | `decimal128`                             |
| `bytes`                                  | `string`  | `byte`                                   |
| `plainDate`                              | `string`  | `date`                                   |
| `plainTime`                              | `string`  | `time`                                   |
| `utcDateTime`、`offsetDateTime`          | `string`  | `date-time`                              |
| `duration`                               | `string`  | `duration`                               |
| `url`                                    | `string`  | `uri`                                    |

Intrinsic 型別：`null` → `{ type: "null" }`；`never` 與 `void` → `{ not: {} }`（任何值都不合法）；`unknown` → `{}`（任何值都合法）。

## 使用者自訂 scalar

以 `extends` 宣告的 scalar 繼承基底的形狀，再疊上自己的文件與驗證關鍵字。scalar 的限制會跟著它到每個使用處：

```typespec
@doc("An RFC 5321 mailbox address.")
@maxLength(254)
scalar Email extends string;

model Account {
  email: Email;
}
```

```yaml
components:
  schemas:
    Account:
      type: object
      properties:
        email:
          type: string
          description: An RFC 5321 mailbox address.
          maxLength: 254
      required:
        - email
```

若屬性重複宣告了 scalar 已帶的關鍵字（例如 scalar 有 `@minLength(5)`，屬性又標 `@minLength(2)`），兩個限制會以 `allOf` 疊加，**兩者都要成立**。使用處不能靜默弱化 scalar 的限制。

## Enum

成員值取自明確給定的值（`Low: 0`），沒給就用成員名稱。全部是字串時 `type` 為 `string`。全部是數字時為 `number`。混用時省略 `type`：

```typespec
enum Color { Red, Green, Blue }
enum Priority { Low: 0, High: 10 }
```

```yaml
components:
  schemas:
    Color:
      type: string
      enum:
        - Red
        - Green
        - Blue
    Priority:
      type: number
      enum:
        - 0
        - 10
```

## Union

只有字串字面值的 union 收斂成單一 `enum`，形狀與字串 enum 相同：

```typespec
model Sub {
  status: "active" | "canceled" | "paused";
}
```

```yaml
Sub:
  type: object
  properties:
    status:
      type: string
      enum:
        - active
        - canceled
        - paused
  required:
    - status
```

其他 union 轉成 `anyOf`，一個 variant 一個分支。`T | null` 就是帶 `null` 分支的 union。JSON Schema draft-07 沒有 `nullable` 關鍵字：

```typespec
union PaymentMethod {
  card: CreditCard,
  transfer: BankTransfer,
}

model Payment {
  method: PaymentMethod;
  memo: string | null;
}
```

```yaml
PaymentMethod:
  anyOf:
    - $ref: "#/components/schemas/CreditCard"
    - $ref: "#/components/schemas/BankTransfer"
Payment:
  type: object
  properties:
    method:
      $ref: "#/components/schemas/PaymentMethod"
    memo:
      anyOf:
        - type: string
        - type: "null"
  required:
    - method
    - memo
```

若要**恰好一個**分支成立（而非「至少一個」），在 union 標 [`@oneOf`](../reference/decorators#oneof)：

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

## 繼承與 discriminator

`model B extends A` 轉成 `allOf: [指向 A 的 $ref, B 自己的屬性]`。`@discriminator` 加上 AsyncAPI 3.x 字串形式的 `discriminator`，值是該屬性的 **wire name**：

```typespec
@discriminator("kind")
model OrderEvent {
  kind: string;
  occurredAt: utcDateTime;
}

model OrderCreated extends OrderEvent {
  kind: "order-created";
  orderId: string;
}

model OrderCanceled extends OrderEvent {
  kind: "order-canceled";
  reason?: string;
}
```

```yaml
components:
  schemas:
    OrderEvent:
      type: object
      properties:
        kind:
          type: string
        occurredAt:
          type: string
          format: date-time
      required:
        - kind
        - occurredAt
      discriminator: kind
    OrderCreated:
      allOf:
        - $ref: "#/components/schemas/OrderEvent"
        - type: object
          properties:
            kind:
              type: string
              enum:
                - order-created
            orderId:
              type: string
          required:
            - kind
            - orderId
    OrderCanceled:
      allOf:
        - $ref: "#/components/schemas/OrderEvent"
        - type: object
          properties:
            kind:
              type: string
              enum:
                - order-canceled
            reason:
              type: string
          required:
            - kind
```

emitter 強制兩條規則（違反時各有[診斷](../reference/diagnostics)）：discriminating 屬性必須定義在該 model 或祖先上，且必須是必填。違反時 `discriminator` 以警告省略，不會輸出壞掉的結果。

## 驗證 decorator

每個 decorator 對應同義的 draft-07 關鍵字。可以標在屬性、model 或 scalar 宣告上：

| TypeSpec decorator                          | Schema 關鍵字                           |
| ------------------------------------------- | --------------------------------------- |
| `@minLength` / `@maxLength`                 | `minLength` / `maxLength`               |
| `@pattern`                                  | `pattern`                               |
| `@format`                                   | `format`                                |
| `@minValue` / `@maxValue`                   | `minimum` / `maximum`                   |
| `@minValueExclusive` / `@maxValueExclusive` | `exclusiveMinimum` / `exclusiveMaximum` |
| `@minItems` / `@maxItems`                   | `minItems` / `maxItems`                 |

```typespec
model Product {
  @minLength(1) @maxLength(50) name: string;
  @minValue(0) @maxValueExclusive(1000000) price: float64;
  @minItems(1) @maxItems(10) tags: string[];
  @pattern("^[A-Z]{2}-\\d{4}$") sku: string;
  @format("uuid") id: string;
}
```

```yaml
Product:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 50
    price:
      type: number
      format: double
      minimum: 0
      exclusiveMaximum: 1000000
    tags:
      type: array
      items:
        type: string
      minItems: 1
      maxItems: 10
    sku:
      type: string
      pattern: ^[A-Z]{2}-\d{4}$
    id:
      type: string
      format: uuid
  required:
    - name
    - price
    - tags
    - sku
    - id
```

輸出沒有 `uniqueItems`。`@typespec/compiler` 沒有對應的 decorator。

若邊界值無法表示為 JSON 數字（例如 `int64` 上的 `@maxValue(9223372036854775807)`），或標在日期、時間、duration 值上，該關鍵字**以警告省略**，不會輸出錯的值。見 [`unrepresentable-numeric-constraint`](../reference/diagnostics#unrepresentable-numeric-constraint) 與 [`unsupported-temporal-range-constraint`](../reference/diagnostics#unsupported-temporal-range-constraint)。

## 文件：`@summary`、`@doc`、`@example`

`@summary` → `title`。`@doc`（或 `/** ... */` 文件註解）→ `description`。`@example` → `examples` 的一個項目，序列化為純 JSON：

```typespec
@summary("Support ticket")
@doc("A ticket opened by a customer.")
@example(#{ id: "T-100", open: true })
model Ticket {
  id: string;
  open: boolean;
}
```

```yaml
Ticket:
  type: object
  properties:
    id:
      type: string
    open:
      type: boolean
  required:
    - id
    - open
  title: Support ticket
  description: A ticket opened by a customer.
  examples:
    - id: T-100
      open: true
```

這三個 decorator 可用在 model、scalar、enum、union、屬性與 union variant。多個 `@example` 依原始碼順序輸出。無法序列化成 JSON 的 example 會被丟棄，並發出 [`unserializable-example`](../reference/diagnostics#unserializable-example) 警告。

## 改寫 wire key：`@encodedName`

schema 的屬性 key 是 wire name，不是 TypeSpec 名稱：

```typespec
model User {
  @encodedName("application/json", "user_name")
  userName: string;
}
```

```yaml
User:
  type: object
  properties:
    user_name:
      type: string
  required:
    - user_name
```

`@discriminator("x")` 仍用 **TypeSpec** 屬性名稱指名。輸出的 `discriminator` 值才是解析後的 wire name。

## Template

具現化的 template 取得依參數推導的穩定名稱：

```typespec
model Page<T> {
  items: T[];
  total: int32;
}

model Uses {
  a: Page<string>;
  b: Page<Order>;
}
```

```yaml
components:
  schemas:
    PageString:
      type: object
      properties:
        items:
          type: array
          items:
            type: string
        total:
          type: integer
          format: int32
      required:
        - items
        - total
    PageOrder:
      # ... 同樣形狀，items 為 $ref Order
```

若要自訂名稱，用 compiler 內建的 `@friendlyName`：

```typespec
@friendlyName("{name}Envelope", T)
model Envelope<T> {
  data: T;
}

model Uses2 {
  e: Envelope<Order>; // 註冊為 "OrderEnvelope"
}
```

若具現化的參數沒有可用的身分（匿名 model、tuple 等），該型別在使用處內聯，不合成名稱。這與 TypeSpec 官方 emitter 的行為一致。

## 逃生口：`@jsonSchemaExtension`

用於本 emitter 沒有專屬 decorator 的 JSON Schema 關鍵字。可重複套用。每次套用加一組 key/value，且會蓋過 emitter 自己產生的同名關鍵字：

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

## Schema key 與名稱衝突

一般宣告的 `components.schemas` key 是宣告名稱加 namespace 鏈前綴。不同 namespace 的同名 model 因此不會相撞。（schema 層尚未接上輸出，前綴的確切格式仍在檢討中，先不要依賴它。）template 具現化的 key 由 template 名稱與參數組成，如上所示。

若兩個宣告解析到同一個 key（例如 `@friendlyName` 撞名，或 model 名稱撞到 template 具現化的推導名稱），回報 [`duplicate-schema-key`](../reference/diagnostics#duplicate-schema-key) **錯誤**。emitter 絕不靜默改名。
