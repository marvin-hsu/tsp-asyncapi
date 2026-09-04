# tsp-avro

[![npm](https://img.shields.io/npm/v/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)
[![downloads](https://img.shields.io/npm/dm/tsp-avro.svg)](https://www.npmjs.com/package/tsp-avro)
[![Node.js](https://img.shields.io/node/v/tsp-avro)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

TypeSpec 的 [Apache Avro](https://avro.apache.org/) emitter，一個 record 寫出一個
`.avsc` 檔案。也用於支援 [`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi)
的 `avro` 預覽功能。

> **注意：** 實驗性套件，還沒到 1.0。decorator、輸出與診斷都可能在任何一次發布中
> 改變，要相依請鎖定確切版本。

## 快速開始

安裝：

```bash
npm install tsp-avro
```

`tspconfig.yaml`：

```yaml
emit:
  - "tsp-avro"
```

`main.tsp`：

```typespec
import "tsp-avro";

@Avro.avroNamespace("com.example.orders")
namespace Orders;

@Avro.avroRecord
model OrderPlaced {
  orderId: string;
  quantity: int32;
}
```

編譯：

```bash
tsp compile .
```

產出 `tsp-output/tsp-avro/com/example/orders/OrderPlaced.avsc`：

```json
{
  "type": "record",
  "name": "OrderPlaced",
  "namespace": "com.example.orders",
  "fields": [
    { "name": "orderId", "type": "string" },
    { "name": "quantity", "type": "int" }
  ]
}
```

Avro namespace 決定檔案寫進哪個目錄。這個 emitter 沒有自己的選項，
`emitter-output-dir` 是每個 emitter 都收的 compiler 選項。

## Decorator

| Decorator                         | 目標                                       | 作用                                                   |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `@Avro.avroNamespace(name)`       | `Namespace`                                | 宣告 Avro namespace。record 往上找，用最接近的那一個。 |
| `@Avro.avroRecord`                | `Model`                                    | 標記一個 model 要輸出。一個標記產生一個檔案。          |
| `@Avro.aliases(...names)`         | `Model`、`ModelProperty`、`Enum`、`Scalar` | 舊名字。讓 reader 讀得懂改名前寫下的資料。             |
| `@Avro.order(mode)`               | `ModelProperty`                            | `ascending`、`descending` 或 `ignore`。                |
| `@Avro.fixed(size)`               | `Model`、`Scalar`                          | 做成指定位元組數的 Avro fixed 型別。                   |
| `@Avro.logicalType(name)`         | `Scalar`、`ModelProperty`                  | 寫出規格定義的其中一個 logical type。                  |
| `@Avro.decimal(precision, scale)` | `Scalar`、`ModelProperty`                  | 寫出 `decimal` logical type 與參數。                   |
| `@Avro.enumDefault(member)`       | `Enum`                                     | reader 遇到不認得的符號時，改用這一個。                |

doc 寫在 `/** */` 註解裡，欄位預設值寫成 `= value`，兩者都不需要 decorator。

## 其他

- [文件](https://tsp-asyncapi.marvinhsu.dev/zh-tw/guide/avro-schemas)
- [GitHub repo](https://github.com/marvin-hsu/tsp-asyncapi)

English: [README.md](./README.md)

## 授權

MIT
