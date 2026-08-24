---
outline: 2
---

# 可重用元件

`components` 放的是文件裡不只一個地方會指向的東西。放進去的片段只寫一次。每個帶著它的地方改寫 `$ref`，不寫副本。

這件事由 emitter 決定。沒有 decorator，也沒有 emitter 選項可以開關。

## 哪些東西會進 `components`

emitter 會填這些區段：

| 區段                | 放什麼                                                                               |
| ------------------- | ------------------------------------------------------------------------------------ |
| `schemas`           | 每個具名的 model、enum、union 與自訂 scalar。以其他語言撰寫的 schema，在第二次使用時 |
| `serverVariables`   | 每個 server 位址變數                                                                 |
| `messages`          | 每個 `@message` model                                                                |
| `securitySchemes`   | 每個 `@securityScheme`                                                               |
| `parameters`        | 每個 channel 位址參數                                                                |
| `correlationIds`    | 兩個以上的 message 寫出相同的 `@correlationId`                                       |
| `serverBindings`    | 兩個以上的 server 帶著相同的 Bindings Object                                         |
| `channelBindings`   | 兩個以上的 channel 帶著相同的 Bindings Object                                        |
| `operationBindings` | 兩個以上的操作帶著相同的 Bindings Object                                             |
| `tags`              | 每個 tag                                                                             |
| `externalDocs`      | 兩個以上的地方帶著相同的 `@externalDocs`                                             |

`messageBindings` 的規則與另外三個 binding 區段相同。

## 兩條規則

一個片段用哪條規則，看作者有沒有給它名字。

### 有名字的一律提升

tag 帶著作者寫的名字。channel 參數、server 變數與 scalar 也是。用一次就夠。元件的 key 就是那個名字。

```typespec
@service(#{ title: "Orders" })
@asyncTag("edge")
namespace Orders;
```

```yaml
info:
  title: Orders
  version: 0.0.0
  tags:
    - $ref: "#/components/tags/edge"
components:
  tags:
    edge:
      name: edge
```

### 沒名字的，第二次使用才提升

Bindings Object 沒有自己的名字。Correlation ID Object 與 External Documentation Object 也沒有。第二次使用才證明元件省得到東西。只用一次的片段留在原地。

```typespec
@service(#{ title: "Orders" })
@kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
@server("production", #{ host: "a.example.com", protocol: "kafka" })
@server("sit", #{ host: "b.example.com", protocol: "kafka" })
namespace Orders;
```

namespace 上的一個 decorator 觸及兩個 server，所以兩者帶著同一個 Bindings Object：

```yaml
servers:
  production:
    host: a.example.com
    protocol: kafka
    bindings:
      $ref: "#/components/serverBindings/Orders"
  sit:
    host: b.example.com
    protocol: kafka
    bindings:
      $ref: "#/components/serverBindings/Orders"
components:
  serverBindings:
    Orders:
      kafka:
        schemaRegistryUrl: https://registry.example.com
        bindingVersion: 0.5.0
```

## 以其他語言撰寫的 schema

payload 不一定是 TypeSpec model。[`@rawPayload`](./decorators/messages#rawpayload) 與 [`@rawHeaders`](./decorators/messages#rawheaders) 帶的是作者用其他語言寫的 schema。[preview 功能](../guide/protobuf-payloads)可以從來源產生一份。這兩種 schema，emitter 都不會讀進去。

這種 schema 沒有自己的名字，所以走第二條規則：第二個帶著它的 message 讓它取得 `schemas` 的項目，兩個 message 接著都寫 `$ref`。只有一個 message 帶著的 schema 留在該 message 裡。

元件的 key 是第一個帶著這份 schema 的 message 的 key，後面加一個字尾。payload 的字尾是 `Payload`，headers 區塊的字尾是 `Headers`。所以名為 `OrderPlaced` 的 message 會把項目命名為 `OrderPlacedPayload`。第二個帶著同一份 schema 的 message 指向那個 key，那個 key 取自第一個 message，不是取自它自己。

payload 與 headers 兩個位置之間不共用。一個 message 的 payload 與 headers 帶著相同的文字時，兩邊都留在原地。

這個 key 的宣告方式與其他衍生 key 相同。model 已經占用的 key 會讓 schema 留在原地，而之後有 model 要求同一個 key 時會回報 [`raw-schema-key-taken`](./diagnostics#raw-schema-key-taken)。

## 元件怎麼取名

每個 key 都來自作者寫過的東西。emitter 不會用內容的雜湊值自創 key。

1. 片段自己的名稱。tag 用 `name`。參數與 server 變數用它所在那張 map 的 key。model、enum、union 與 scalar 用宣告名稱。
2. 片段掛著的宣告。Bindings Object 用套用該 decorator 的那個型別的名稱。上面的例子就是 `Orders` 這個 namespace。
3. 第一個帶著它的地方。External Documentation Object 走這一條，因為沒有別的東西替它命名。以其他語言撰寫的 schema 也走這一條。

key 會淨化成 AsyncAPI 規定的 `components` key 字元集。這個編碼與 `components.schemas` 現行使用的相同，所以兩個不同的名稱不會併成同一個 key。

## 兩個同名的片段

兩個 Tag Object 可以名字相同、其餘不同。它們是兩個片段，卻要求同一個 key。

這時兩個都不提升，各自的地方都寫出 tag 本身。挑一個贏家會讓其中一個地方靜默拿到另一個地方的文字。

兩個 channel 對同名參數寫出不同描述時，規則相同。

## 什麼時候 property 會就地展開 scalar

自訂 scalar 會拿到一個元件，指向它的 property 寫 `$ref`。

有一個例外。property 自己對這個值說了話時，就地展開 scalar。這包含 `@doc`、`@summary`、`@example`、`@format` 與 `@encode`。

這些是**取代**而不是疊加。`$ref` 拿不掉被指向那份 schema 裡的字，兩份都會寫出來，一份包在另一份裡。

```typespec
@doc("An RFC 5321 mailbox address.")
scalar Email extends string;

@message
model Signup {
  contact: Email;

  /** Where the receipt goes. */
  receipt: Email;
}
```

```yaml
components:
  schemas:
    Email:
      type: string
      description: An RFC 5321 mailbox address.
    Signup:
      type: object
      properties:
        contact:
          $ref: "#/components/schemas/Email"
        receipt:
          type: string
          description: Where the receipt goes.
```

只加約束的 property 仍然寫 `$ref`。同一個值上的兩個約束同時成立，那正好就是 `allOf` 的意思。

```typespec
@maxLength(254)
scalar Email extends string;

@message
model Signup {
  @maxLength(64)
  short: Email;
}
```

```yaml
short:
  allOf:
    - $ref: "#/components/schemas/Email"
  maxLength: 64
```

## `$ref` 放在整個 Bindings Object 上

AsyncAPI 接受 `bindings` 上的 `$ref`，不接受 `bindings.kafka` 上的。

所以 emitter 共用的單位是整個 Bindings Object，含裡面的每個通訊協定。兩個 server 若只有一個通訊協定相同、另一個不同，就什麼都不共用。

## emitter 不抽出來的東西

| 區段                               | 為什麼不做                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `operationTraits`、`messageTraits` | trait 去重的是輸出文件，不是來源。TypeSpec 在來源層已經有 `extends`、`is` 與 spread。                                               |
| `servers`                          | AsyncAPI 規定 channel 的 `servers` 必須指向根層的 `servers`。放進 `components` 沒有讀者。                                           |
| `channels`                         | 操作只定址根層的 `channels`。這裡只放得下「沒有任何操作指向的 channel」。                                                           |
| `operations`                       | 單一文件裡沒有東西會引用操作，放進來就是沒有工具會解析的文字。                                                                      |
| `replies`、`replyAddresses`        | 兩個一模一樣的 Operation Reply Object 代表兩個操作共用一個 channel 而且共用一組 message。那是該回報給作者的事實，不是該去重的東西。 |
