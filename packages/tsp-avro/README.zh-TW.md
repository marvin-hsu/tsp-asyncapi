# tsp-avro

**實驗性套件。** 這個套件把 TypeSpec 產出成 [Apache Avro][avro] schema 檔。
版本是 0.1.0，公開介面可能在任何一次發布中改變。若要相依它，請鎖定確切版本。

它是 [`@typespec/protobuf`][protobuf] 的 Avro 同位物。它不是 AsyncAPI 套件：
它宣告自己的 decorator、註冊自己的 `$onEmit`，並寫出 `.avsc` 檔。

## 目前狀態

走訪只完成一部分。它寫得出 record、欄位、陣列、map、enum 與 union，
也寫得出選填屬性與屬性預設值。其餘一律拒絕，而拒絕就是錯誤。

以下項目會回報一個 diagnostic。

- 繼承其他 model 的 model。
- 匿名 model。
- template 實例，例如 `Box<string>`。
- 同時帶索引簽章與欄位的 model。
- 下方對照表以外的 scalar。
- 同一個型別出現兩次的 union，例如 `string[] | int32[]`。

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
也不允許重複的分支。具名型別以 full name 比對，其餘分支以 Avro 型別名稱比對。

## 安裝

```bash
npm install tsp-avro
```

## 使用

```yaml
# tspconfig.yaml
emit:
  - "tsp-avro"
```

這個 emitter 沒有自己的選項。輸出目錄請用 compiler 選項 `emitter-output-dir`
設定。

```typespec
import "tsp-avro";

@Avro.`namespace`("com.example.orders")
namespace Orders {
  /** Where an order goes. */
  model Address {
    street: string;
    city: string;
  }

  /** An order left the checkout. */
  @Avro.`record`
  model OrderPlaced {
    id: string;
    shipping: Address;
    tags: string[];
  }
}
```

這份原始碼寫出一個檔案：`com/example/orders/OrderPlaced.avsc`。

## 兩個 decorator 名稱都要加反引號

TypeSpec 把 `namespace` 與 `record` 列為保留字。請寫成
`` @Avro.`namespace` `` 與 `` @Avro.`record` ``，名稱兩側加反引號。
少了反引號，compiler 會回報 `reserved-identifier`。

上游的 Protobuf library 也以同樣理由寫成 `` @Protobuf.`package` ``。

## Decorator

| Decorator                   | 目標        | 作用                                                          |
| --------------------------- | ----------- | ------------------------------------------------------------- |
| ``@Avro.`namespace`(name)`` | `Namespace` | 宣告底下所有型別的 Avro namespace。最近的祖先生效。           |
| `` @Avro.`record` ``        | `Model`     | 標記一個 model 要輸出。一個標記的 model 產生一個 `.avsc` 檔。 |

## 一個檔案裝一份完整的 schema

Avro 沒有 import。一份 schema 檔自成一體。

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

## Diagnostic

| 代碼                          | 何時發生                         |
| ----------------------------- | -------------------------------- |
| `tsp-avro/namespace-required` | record 上方沒有 Avro namespace。 |
| `tsp-avro/invalid-name`       | 名稱不符合 Avro 的名稱規則。     |
| `tsp-avro/unsupported-type`   | 型別目前沒有 Avro 形式。         |
| `tsp-avro/unsupported-field`  | 屬性是選填的，或帶有預設值。     |
| `tsp-avro/enum-member-value`  | enum 成員帶有自己的值。          |

每個 diagnostic 都是錯誤。錯誤會擋掉所有寫檔，所以一次編譯要嘛寫出你要的
schema，要嘛一個都不寫。半份 schema 仍然是合法的 schema，schema registry
會照收。

## 授權

MIT

[avro]: https://avro.apache.org/
[protobuf]: https://typespec.io/docs/emitters/protobuf/reference/
