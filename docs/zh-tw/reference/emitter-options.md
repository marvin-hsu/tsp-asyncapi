---
title: "Emitter 選項"
description: '在 `tspconfig.yaml` 設定，或在 CLI 以 `--option "tsp-asyncapi.<name>=<value>"` 傳入。'
---

# Emitter 選項

在 `tspconfig.yaml` 設定，或在 CLI 以 `--option "tsp-asyncapi.<name>=<value>"` 傳入。

| 選項                   | 型別               | 預設值                                                      | 效果                                                                          |
| ---------------------- | ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `file-type`            | `"yaml" \| "json"` | `yaml`                                                      | 文件的序列化格式。                                                            |
| `output-file`          | `string`           | `asyncapi.yaml`；`file-type` 為 `json` 時是 `asyncapi.json` | 輸出檔名，寫在 `tsp-output/tsp-asyncapi/` 底下。                              |
| `asyncapi-id`          | `string`           | （省略）                                                    | 輸出為文件頂層的 `id` 欄位，即應用程式的全域識別碼，慣例上用 URN。            |
| `default-content-type` | `string`           | （省略）                                                    | 輸出為 `defaultContentType`。message 沒宣告 content type 時，payload 用這個。 |
| `preview-features`     | `string[]`         | `[]`                                                        | 開啟預覽功能。保留的名稱是 `protobuf` 與 `avro`。                             |

沒設定的選項會整個從文件省略，不會輸出空值。

## 用 `tspconfig.yaml`

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    output-file: "orders.yaml"
    file-type: "yaml"
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

## 用 CLI

```bash
tsp compile . --emit tsp-asyncapi \
  --option "tsp-asyncapi.file-type=json" \
  --option "tsp-asyncapi.asyncapi-id=urn:com:example:orders"
```

未知的選項名稱會在編譯時驗證失敗（`additionalProperties: false`）。打錯字會被抓到，不會被靜默忽略。`preview-features` 裡不是保留名稱的值也一樣會失敗，訊息會列出保留的名稱。

## 預覽功能

預覽功能會改變輸出的文件。本版的 `protobuf` 已經有對應的實作。帶有官方 `TypeSpec.Protobuf` decorator 的 model，payload 會是整個 package 的 proto3 文字。

`avro` 是保留名稱，還沒有對應的實作。請求它會回報 `preview-feature-unavailable`，而且不寫出檔案。同時請求兩個名稱一樣會被拒絕，因為文件仍然缺少 `avro` 要求的內容。

::: warning
預覽功能被拒絕時不會輸出任何東西。在錯誤旁邊寫出一份文件，等於忽略了請求卻不說明。
:::

名稱在功能存在之前就先保留。先保留的用意是：專案寫下這個名稱時，得到的是關於這個功能的答覆，而不是「未知的值」這種 schema 錯誤。
