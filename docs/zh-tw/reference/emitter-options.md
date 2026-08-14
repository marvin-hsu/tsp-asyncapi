# Emitter 選項

在 `tspconfig.yaml` 設定，或在 CLI 以 `--option "typespec-asyncapi.<name>=<value>"` 傳入。

| 選項                   | 型別               | 預設值                                                      | 效果                                                                          |
| ---------------------- | ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `file-type`            | `"yaml" \| "json"` | `yaml`                                                      | 文件的序列化格式。                                                            |
| `output-file`          | `string`           | `asyncapi.yaml`；`file-type` 為 `json` 時是 `asyncapi.json` | 輸出檔名，寫在 `tsp-output/typespec-asyncapi/` 底下。                         |
| `asyncapi-id`          | `string`           | （省略）                                                    | 輸出為文件頂層的 `id` 欄位，即應用程式的全域識別碼，慣例上用 URN。            |
| `default-content-type` | `string`           | （省略）                                                    | 輸出為 `defaultContentType`。message 沒宣告 content type 時，payload 用這個。 |

沒設定的選項會整個從文件省略，不會輸出空值。

## 用 `tspconfig.yaml`

```yaml
emit:
  - "typespec-asyncapi"
options:
  "typespec-asyncapi":
    output-file: "orders.yaml"
    file-type: "yaml"
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

## 用 CLI

```bash
tsp compile . --emit typespec-asyncapi \
  --option "typespec-asyncapi.file-type=json" \
  --option "typespec-asyncapi.asyncapi-id=urn:com:example:orders"
```

未知的選項名稱會在編譯時驗證失敗（`additionalProperties: false`）。打錯字會被抓到，不會被靜默忽略。
