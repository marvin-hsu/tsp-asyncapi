---
outline: 2
---

# 可重用元件

`components` 中的元件可以被多個地方用 `$ref` 引用。tsp-asyncapi 會自動判斷是否要放入 `components` 共用。

## `components`

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
| `operationBindings` | 兩個以上的 operation 帶著相同的 Bindings Object                                      |
| `tags`              | 每個 tag                                                                             |
| `externalDocs`      | 兩個以上的地方帶著相同的 `@externalDocs`                                             |

`messageBindings` 的規則與另外三個 binding 區段相同。

## 元件怎麼取名

元件的 key 就是原始碼裡的名字。

| 元件                          | key                                                            |
| ----------------------------- | -------------------------------------------------------------- |
| tag                           | `@asyncTag` 的 `name`                                          |
| channel 參數、server 變數     | 參數或變數的名稱                                               |
| model、enum、union、scalar    | 宣告的名稱                                                     |
| Bindings Object               | 套用 binding decorator 的 namespace、interface 或 model 的名稱 |
| External Documentation Object | 第一個帶著它的物件的名稱                                       |

名字裡有 `components` key 不允許的字元時，會照 [schema key 的規則](./decorators/schemas#schema-key-怎麼決定)改寫。

## 什麼時候屬性會就地展開 scalar

自訂 scalar 會放進 `components`，用到它的屬性寫 `$ref`。

但屬性上如果有 `@doc`、`@summary`、`@example`、`@format` 或 `@encode`，就不寫 `$ref`，改成把 scalar 的內容直接展開在屬性上，再套上屬性自己的設定。因為 `$ref` 沒辦法蓋掉 scalar 原本的 `description` 或 `format`。

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

只加約束的屬性仍然寫 `$ref`。同一個值上的兩個約束同時成立，那正好就是 `allOf` 的意思。

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

具名 union 上的 `@encode` 也照這個規則走。union 的 component 描述的是宣告時的形狀，所以屬性上的編碼只要對應得到其中一個 variant，整個 union 就會就地展開。編碼如果對應不到任何 variant，會報 [`encoding-describes-no-variant`](./diagnostics#encoding-describes-no-variant)，每個 variant 維持自己型別原本的形狀。

## emitter 不抽出來的東西

| 區段                        | 為什麼不做                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `servers`                   | AsyncAPI 規定 channel 的 `servers` 必須指向根層的 `servers`。放進 `components` 沒有讀者。                                                  |
| `channels`                  | operation 只定址根層的 `channels`。這裡只放得下「沒有任何 operation 指向的 channel」。                                                     |
| `operations`                | 單一文件裡沒有東西會引用 operation，放進來就是沒有工具會解析的文字。                                                                       |
| `replies`、`replyAddresses` | 兩個一模一樣的 Operation Reply Object 代表兩個 operation 共用一個 channel 而且共用一組 message。那是該回報給作者的事實，不是該去重的東西。 |
