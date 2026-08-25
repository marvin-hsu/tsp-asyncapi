# tsp-avro

**實驗性套件。** 這個套件把 TypeSpec 產出成 [Apache Avro][avro] schema 檔。
版本是 0.1.0，公開介面可能在任何一次發布中改變。若要相依它，請鎖定確切版本。

它是 [`@typespec/protobuf`][protobuf] 的 Avro 同位物。它不是 AsyncAPI 套件：
它宣告自己的 decorator、註冊自己的 `$onEmit`，並寫出 `.avsc` 檔。

## 目前狀態

這個套件是骨架。它註冊了 library 與 emitter，而 emitter 目前不寫任何檔案。
decorator 與 schema 走訪是接下來的工作。

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

## 授權

MIT

[avro]: https://avro.apache.org/
[protobuf]: https://typespec.io/docs/emitters/protobuf/reference/
