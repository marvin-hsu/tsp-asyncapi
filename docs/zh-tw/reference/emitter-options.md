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

預覽功能會改變輸出的文件。保留的名稱有兩個：`protobuf` 與 `avro`。本版兩個都可以使用。背後沒有實作的名稱會回報 `preview-feature-unavailable`，而且不寫出檔案。一份請求同時指名一個可用的功能與一個不可用的功能，一樣整份被拒絕，因為整份請求無法被回應。

`protobuf` 讓帶有官方 `TypeSpec.Protobuf` decorator 的 model 拿到 proto3 payload。[Protobuf payload 指南](../guide/protobuf-payloads)說明它寫出什麼。

`avro` 讓帶有 `tsp-avro` `@Avro.record` decorator 的 model 拿到 Avro payload。payload 是以物件寫出的，因為 Avro 就是 JSON。`tsp-avro` 是這個 emitter 的選用 peer dependency。開啟這個功能的專案要自行安裝它。

兩個功能可以同時開啟。同一個 model 只能帶其中一組 decorator。兩組都帶的 model 會回報 `conflicting-generated-schema-source`，而且不寫出檔案。

::: warning
預覽功能被拒絕時不會輸出任何東西。在錯誤旁邊寫出一份文件，等於忽略了請求卻不說明。
:::

名稱在功能存在之前就先保留。先保留的用意是：專案寫下這個名稱時，得到的是關於這個功能的答覆，而不是「未知的值」這種 schema 錯誤。
