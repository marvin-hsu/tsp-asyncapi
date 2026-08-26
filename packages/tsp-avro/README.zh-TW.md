# tsp-avro

**實驗性套件。** 這個套件把 TypeSpec 產出成 [Apache Avro][avro] schema 檔案。
它尚未進入 1.0，公開介面可能在任何一次發佈中改變。若要相依它，請鎖定確切版本。

它是 [`@typespec/protobuf`][protobuf] 的 Avro 同位物。它不是 AsyncAPI 套件：
它宣告自己的 decorator、註冊自己的 `$onEmit`，並寫出 `.avsc` 檔案。

[Avro schema 指南][guide]有同樣的內容，另附一個完整範例。

## 安裝

```bash
npm install tsp-avro
```

## 使用

```yaml
# tspconfig.yaml
emit:
  - "tsp-avro"

options:
  "tsp-avro":
    emitter-output-dir: "{project-root}/schemas"
```

這個 emitter 沒有自己的選項。`emitter-output-dir` 是 compiler 選項，
每個 emitter 都收。

```typespec
import "tsp-avro";

@Avro.avroNamespace("com.example.orders")
namespace Orders {
  /** Where an order goes. */
  model Address {
    street: string;
    city: string;
  }

  /** An order left the checkout. */
  @Avro.avroRecord
  model OrderPlaced {
    id: string;
    shipping: Address;
    tags: string[];
  }
}
```

這份原始碼寫出一個檔案：`com/example/orders/OrderPlaced.avsc`。

## Decorator

| Decorator                         | 目標                             | 作用                                          |
| --------------------------------- | -------------------------------- | --------------------------------------------- |
| `@Avro.avroNamespace(name)`       | `Namespace`                      | 宣告 Avro namespace。最近的祖先生效。         |
| `@Avro.avroRecord`                | `Model`                          | 標記一個 model 要輸出。一個標記產生一個檔案。 |
| `@Avro.aliases(...names)`         | `Model`、`ModelProperty`、`Enum` | 指定這個宣告以前叫什麼名字。                  |
| `@Avro.order(mode)`               | `ModelProperty`                  | `ascending`、`descending` 或 `ignore`。       |
| `@Avro.fixed(size)`               | `Model`、`Scalar`                | 做成指定位元組數的 Avro fixed 型別。          |
| `@Avro.logicalType(name)`         | `Scalar`、`ModelProperty`        | 寫出規格定義的其中一個 logical type。         |
| `@Avro.decimal(precision, scale)` | `Scalar`、`ModelProperty`        | 寫出 `decimal` logical type 與它的參數。      |
| `@Avro.enumDefault(member)`       | `Enum`                           | 指定 reader 退回的符號。                      |

doc 來自原生的 `/** */` 註解。欄位預設值來自原生的 `= value`。
這兩件事都沒有 decorator。

## 選填屬性與預設值

Avro 沒有選填欄位。可以不存在的欄位是一個帶 null 的 union。
union 只有在預設值對得上第一個分支時才帶預設值。
所以 TypeSpec 的 `?` 與 `= value` 一起決定輸出的形狀。

| TypeSpec           | Avro                                                   |
| ------------------ | ------------------------------------------------------ |
| `x: string`        | `{"name":"x","type":"string"}`                         |
| `x?: string`       | `{"name":"x","type":["null","string"],"default":null}` |
| `x: string = "a"`  | `{"name":"x","type":"string","default":"a"}`           |
| `x?: string = "a"` | `{"name":"x","type":["string","null"],"default":"a"}`  |

最後一列的順序是反的。作者寫了一個不是 null 的預設值，所以 null 不能排第一。

union 用 `|` 寫。union 裡的 union 會被攤平，因為 Avro 既不允許巢狀，
也不允許重複的分支。具名型別以完整名稱比對，其餘分支以 Avro 型別名稱比對。

## 一個檔案裝一份完整的 schema

Avro 沒有 import。一份 schema 檔案自成一體。

所以一個 record 走得到的每個具名型別，都寫進這個 record 自己的檔案。
Avro 在具名型別第一次出現時寫完整定義。之後只寫它的完整名稱。
兩個 record 共用第三個型別時，各自持有一份副本。

走到自己的 record 不需要另一條規則。它的名稱在欄位之前就寫好了，
所以回頭指向它的欄位找得到那個名稱。

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

自己宣告的 scalar 依它所繼承的 scalar 對應。`scalar Age extends int32`
對應到 `int`。

Avro 沒有無號整數，所以 `uint32` 與 `uint64` 會被拒絕。放寬型別會改變
作者寫下的意思。

## Logical type

logical type 是型別的一個屬性，不是獨立的型別。下表是 `@Avro.logicalType`
接受的內容，也是 Avro 規格定義的那張表。表以外的組合會被拒絕。

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

`decimal` 帶 precision 與 scale，所以它有自己的 decorator。請寫
`@Avro.decimal(precision, scale)`，不要寫 `@Avro.logicalType("decimal")`。

## 它拒絕什麼

以下每一項都會回報診斷，而不是硬翻。

- 繼承其他 model 的 model。
- 匿名 model。
- template 實例，例如 `Box<string>`。
- 同時帶索引簽章與欄位的 model。
- 上面對照表以外的 scalar。
- 同一個型別出現兩次的 union，例如 `string[] | int32[]`。
- 兩個宣告對應到同一個 Avro 完整名稱。

## 診斷

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

每個診斷都是錯誤。錯誤會擋掉所有寫檔，所以一次編譯要嘛寫出你要的 schema，
要嘛一個都不寫。半份 schema 仍然是合法的 schema，schema registry 會照收。

## 穩定性

這個套件是實驗性質。它還沒到 1.0，decorator、輸出與診斷都可能在任何一次發布中改變。

## 授權

MIT

[avro]: https://avro.apache.org/
[protobuf]: https://typespec.io/docs/emitters/protobuf/reference/
[guide]: https://marvin-hsu.github.io/tsp-asyncapi/zh-tw/guide/avro-schemas
