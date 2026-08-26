---
title: "Avro schema"
description: "tsp-avro 是這個 repository 的第二個 emitter。它把 TypeSpec model 寫成 Apache Avro schema 檔案。本頁說明它寫出什麼，以及它守住哪些規則。"
---

# Avro schema

[`tsp-avro`](https://www.npmjs.com/package/tsp-avro) 是這個 repository 的第二個 emitter。它把 TypeSpec model 寫成 Apache Avro schema 檔案。它不寫 AsyncAPI 文件，也不需要任何 AsyncAPI decorator。

::: warning
這是實驗性套件，尚未進入 1.0。它的 decorator、輸出與診斷都可能在任何一次發佈中改變。若要相依它，請鎖定確切版本。
:::

AsyncAPI emitter 的 `avro` 預覽功能呼叫的是同一個套件。開啟之後，帶著 `@Avro.avroRecord` 的 model 也會拿到 Avro schema 當作 AsyncAPI payload。開啟方式見 [Avro payload 指南](./avro-payloads)。

## 這個套件做什麼

它是 [`@typespec/protobuf`](https://typespec.io/docs/emitters/protobuf/reference/) 的 Avro 同位物。它宣告自己的 decorator，也註冊自己的 emitter。

標上 `@Avro.avroRecord` 的 model 會變成一個 `.avsc` 檔案。model 的 Avro namespace 決定那個檔案寫進哪個目錄。

Avro 需要的 decorator 很少，因為一個純 TypeSpec model 本來就是合法的 Avro record。Avro 沒有欄位編號。所以這裡的 decorator 只補 Avro 有、而 TypeSpec 表達不了的東西。

## 安裝與開啟

先在 compiler 旁邊安裝這個套件。

```bash
pnpm add tsp-avro
```

接著在 `tspconfig.yaml` 裡指定這個 emitter。

```yaml
emit:
  - "tsp-avro"

options:
  "tsp-avro":
    emitter-output-dir: "{project-root}/schemas"
```

這個 emitter 沒有自己的選項。`emitter-output-dir` 是 compiler 選項，每個 emitter 都收。

## 撰寫來源

以下範例是 repository 裡的 [`examples/17-avro-schemas`](https://github.com/marvin-hsu/tsp-asyncapi/tree/main/examples/17-avro-schemas)。那個目錄有原始碼、編譯時用的 `tspconfig.yaml`，以及 emitter 寫出的 schema 檔案。

```typespec
@Avro.avroNamespace("com.example.orders")
namespace Orders;

// The logical type sits on the scalar, so every field of this type carries
// it. A reader that knows `timestamp-millis` builds a timestamp. A reader
// that does not know it reads the `long`, which is what is on the wire.
/** A moment in time, as the milliseconds since the Unix epoch. */
@Avro.logicalType("timestamp-millis")
scalar Timestamp extends int64;
```

Avro namespace 掛在 namespace 上。最靠近該宣告的那一個生效。

logical type 掛在 scalar 上。每個屬於該 scalar 的欄位都帶著它。

下面是範例的其中一個 model。完整檔案在 repository 裡。

```typespec
/** The fulfilment of an order moved on. */
@Avro.avroRecord
model OrderFulfilmentChanged {
  // `@aliases` names what a field used to be called. A reader written against
  // this schema still reads data written under the old name.
  /** The identifier of the order. */
  @Avro.aliases("orderNumber")
  @Avro.logicalType("uuid")
  id: string;

  /** When the fulfilment moved on. */
  changedAt: Timestamp;

  /** How far the order has got. */
  status: FulfilmentStatus;

  /** Where the order is going, as it stood at this moment. */
  shipping: Address;

  // The author wrote a default that is not null, so the string leads the
  // union and null follows it. That is the same Avro rule as above, read the
  // other way round.
  /** What the carrier calls this shipment. */
  trackingNumber?: string = "pending";
}
```

## emitter 寫出什麼

這個 model 會變成 `schemas/com/example/orders/OrderFulfilmentChanged.avsc`。

<!-- prettier-ignore -->
```json
{
  "type": "record",
  "name": "OrderFulfilmentChanged",
  "namespace": "com.example.orders",
  "doc": "The fulfilment of an order moved on.",
  "fields": [
    {
      "name": "id",
      "type": {
        "type": "string",
        "logicalType": "uuid"
      },
      "doc": "The identifier of the order.",
      "aliases": [
        "orderNumber"
      ]
    },
    {
      "name": "changedAt",
      "type": {
        "type": "long",
        "logicalType": "timestamp-millis"
      },
      "doc": "When the fulfilment moved on."
    },
    {
      "name": "status",
      "type": {
        "type": "enum",
        "name": "FulfilmentStatus",
        "namespace": "com.example.orders",
        "doc": "How far an order has got.",
        "symbols": [
          "Unknown",
          "Placed",
          "Packed",
          "Shipped",
          "Delivered"
        ],
        "default": "Unknown"
      },
      "doc": "How far the order has got."
    },
    {
      "name": "shipping",
      "type": {
        "type": "record",
        "name": "Address",
        "namespace": "com.example.orders",
        "doc": "Where an order goes.",
        "fields": [
          {
            "name": "line1",
            "type": "string",
            "doc": "The street and the number."
          },
          {
            "name": "line2",
            "type": [
              "null",
              "string"
            ],
            "doc": "The flat, the floor, or whatever else the courier needs.",
            "default": null
          },
          {
            "name": "city",
            "type": "string"
          },
          {
            "name": "postcode",
            "type": "string",
            "doc": "The postcode, as the destination country writes it."
          },
          {
            "name": "country",
            "type": "string",
            "doc": "The ISO 3166-1 alpha-2 code of the country."
          }
        ]
      },
      "doc": "Where the order is going, as it stood at this moment."
    },
    {
      "name": "trackingNumber",
      "type": [
        "string",
        "null"
      ],
      "doc": "What the carrier calls this shipment.",
      "default": "pending"
    }
  ]
}
```

`/** */` 註解會變成它所標註之宣告的 `doc`。`//` 註解不會輸出。

這個檔案完整寫下 model `Address` 與 enum `FulfilmentStatus`。兩個宣告都沒有 `@Avro.avroRecord`，所以都沒有自己的檔案。

## 一個檔案裝一份完整的 schema

Avro 沒有 import。一份 schema 檔案自成一體。

所以一個 record 走得到的每個具名型別，都寫進這個 record 自己的檔案。Avro 在具名型別第一次出現時寫完整定義，之後只寫它的完整名稱。範例裡兩個 record 都走到 `Address`，兩個檔案就各有一份。

同一個檔案裡的第二次出現只是一個名稱。以下是 `OrderPlaced` 的 `billing` 欄位，它走到的 `Address` 已經由 `shipping` 欄位寫出來了。

<!-- prettier-ignore -->
```json
    {
      "name": "billing",
      "type": [
        "null",
        "com.example.orders.Address"
      ],
      "doc": "Where the invoice goes, when it is not the shipping address.",
      "default": null
    },
```

走到自己的 record 不需要另一條規則。它的名稱在欄位走訪之前就先登記好，所以回頭指向它的欄位找得到那個名稱。

## 選填欄位與預設值

Avro 沒有選填欄位。可以不存在的欄位是一個帶 null 的 union。

Avro 只拿 union 的第一個分支來讀預設值。所以 TypeSpec 的 `?` 與 `= value` 一起決定輸出的形狀。

| TypeSpec           | Avro                                                   |
| ------------------ | ------------------------------------------------------ |
| `x: string`        | `{"name":"x","type":"string"}`                         |
| `x?: string`       | `{"name":"x","type":["null","string"],"default":null}` |
| `x: string = "a"`  | `{"name":"x","type":"string","default":"a"}`           |
| `x?: string = "a"` | `{"name":"x","type":["string","null"],"default":"a"}`  |

最後一列的順序是反的。作者寫了一個不是 null 的預設值，所以 null 不能排第一。上面那個檔案的 `trackingNumber` 欄位就是這一列。

union 用 `|` 寫。union 裡的 union 會被攤平，因為 Avro 既不允許巢狀，也不允許重複的分支。具名分支以完整名稱比對，其餘分支以 Avro 型別名稱比對。

## 陣列、map 與 enum

`T[]` 變成 Avro 陣列。`Record<T>` 變成 Avro map。Avro 的 map 一律以字串當鍵，所以只寫出值的型別。

<!-- prettier-ignore -->
```json
    {
      "name": "metadata",
      "type": {
        "type": "map",
        "values": "string"
      },
      "doc": "Whatever the checkout wanted to carry along."
    }
```

TypeSpec enum 變成 Avro enum。Avro 的 enum 只有符號，所以帶著自己的值的成員會被拒絕。`@Avro.enumDefault` 指定 reader 讀到未知符號時退回的那一個。

## Scalar

| TypeSpec  | Avro      |
| --------- | --------- |
| `boolean` | `boolean` |
| `bytes`   | `bytes`   |
| `string`  | `string`  |
| `int32`   | `int`     |
| `int64`   | `long`    |
| `float32` | `float`   |
| `float64` | `double`  |

自己宣告的 scalar 依它所繼承的 scalar 對應。`scalar Age extends int32` 對應到 `int`。

Avro 沒有無號整數。`uint32` 與 `uint64` 會被拒絕，因為放寬型別會改變作者寫下的意思。

## Logical type

logical type 是型別的一個屬性，不是獨立的型別。Avro 用 `int` 承載日期，知道這個屬性的 reader 會據此建出日期。不知道的 reader 讀到的是那個數字。所以這個屬性不改變傳輸上的內容。

`@Avro.logicalType` 寫出一個 logical type。規格指定了每一個底下的型別，下表就是 emitter 持有的對照。

| Logical type             | 寫在什麼上面       |
| ------------------------ | ------------------ |
| `decimal`                | `bytes`、fixed     |
| `uuid`                   | `string`           |
| `date`                   | `int`              |
| `time-millis`            | `int`              |
| `time-micros`            | `long`             |
| `timestamp-millis`       | `long`             |
| `timestamp-micros`       | `long`             |
| `local-timestamp-millis` | `long`             |
| `local-timestamp-micros` | `long`             |
| `duration`               | fixed，12 個位元組 |

表以外的組合會被拒絕。表以外的名稱也會被拒絕。

`decimal` 是唯一帶參數的 logical type，所以它有自己的 decorator。寫成 `@Avro.decimal(precision, scale)`。precision 是位數，scale 是其中落在小數點之後的位數。放在 fixed 型別裡的 decimal 受那個型別的寬度限制。

## Decorator

| Decorator                         | 目標                             | 作用                                          |
| --------------------------------- | -------------------------------- | --------------------------------------------- |
| `@Avro.avroNamespace(name)`       | `Namespace`                      | 宣告 Avro namespace。最近的祖先生效。         |
| `@Avro.avroRecord`                | `Model`                          | 標記一個 model 要輸出。一個標記產生一個檔案。 |
| `@Avro.aliases(...names)`         | `Model`、`ModelProperty`、`Enum` | 指定這個宣告以前叫什麼名字。                  |
| `@Avro.order(mode)`               | `ModelProperty`                  | `ascending`、`descending` 或 `ignore`。       |
| `@Avro.fixed(size)`               | `Model`、`Scalar`                | 做成指定位元組數的 Avro fixed 型別。          |
| `@Avro.logicalType(name)`         | `Scalar`、`ModelProperty`        | 寫出上表中的一個 logical type。               |
| `@Avro.decimal(precision, scale)` | `Scalar`、`ModelProperty`        | 寫出 `decimal` logical type 與它的參數。      |
| `@Avro.enumDefault(member)`       | `Enum`                           | 指定 reader 退回的符號。                      |

doc 來自原生的 `/** */` 註解。欄位預設值來自原生的 `= value`。這兩件事都沒有 decorator。

## 診斷

這個套件的每個診斷都是錯誤。錯誤會擋掉所有寫檔。所以一次編譯要嘛寫出你要的 schema，要嘛一個都不寫。

半份 schema 仍然是合法的 schema。registry 會照收，而 reader 會把資料解成作者從來沒寫過的形狀。

| 代碼                              | 何時發生                                           |
| --------------------------------- | -------------------------------------------------- |
| `tsp-avro/namespace-required`     | record 上方沒有 Avro namespace。                   |
| `tsp-avro/invalid-name`           | 名稱不符合 Avro 的名稱規則。                       |
| `tsp-avro/unsupported-type`       | 型別沒有 Avro 形式。                               |
| `tsp-avro/duplicate-union-branch` | 一個 union 裡有兩個分支是同一個 Avro 型別。        |
| `tsp-avro/invalid-default`        | 預設值沒有 JSON 形式，或不屬於 union 的任何分支。  |
| `tsp-avro/invalid-order`          | `@Avro.order` 收到的不是 Avro 的欄位排序方式。     |
| `tsp-avro/invalid-fixed`          | `@Avro.fixed` 收到的寬度不是正數。                 |
| `tsp-avro/invalid-decimal`        | precision 或 scale 不合，或 `decimal` 兩者都沒有。 |
| `tsp-avro/unknown-logical-type`   | logical type 不是規格定義的那幾個。                |
| `tsp-avro/logical-type-mismatch`  | logical type 寫在規格不允許的型別上。              |
| `tsp-avro/duplicate-logical-type` | 一個宣告帶了兩個 logical type。                    |
| `tsp-avro/enum-default`           | `@Avro.enumDefault` 指定的成員不在該 enum 裡。     |
| `tsp-avro/duplicate-record`       | 兩個 record 寫到同一個路徑。                       |
| `tsp-avro/enum-member-value`      | enum 成員帶著自己的值。                            |

## 它拒絕什麼

以下情況會回報診斷，而不是硬翻。

- 繼承其他 model 的 model。Avro record 沒有繼承。
- 匿名 model。Avro record 需要名稱。
- template 執行個體，例如 `Box<string>`。同一個 template 的兩個執行個體共用一個名稱。
- 同時帶索引簽章與欄位的 model。
- 上面對照表以外的 scalar。
- 同一個型別出現兩次的 union，例如 `string[] | int32[]`。
- 兩個宣告對應到同一個 Avro 完整名稱。
