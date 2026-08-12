# typespec-asyncapi

[English](./README.md) | 繁體中文

[TypeSpec](https://typespec.io/) 的 [AsyncAPI](https://www.asyncapi.com/) emitter — 用 TypeSpec 描述事件驅動 API（Kafka、MQTT、WebSocket 等），從單一事實來源（single source of truth）產出 AsyncAPI 文件。

> **狀態：開發中（WIP）。** 這是一個從零自行實作 TypeSpec AsyncAPI emitter 的個人專案。目前 emitter 只會輸出最小的 placeholder 文件；decorator、channel / operation / message 對應與 AsyncAPI 3.0 支援都還在開發中。

## 為什麼做這個

TypeSpec 對 OpenAPI 有官方一級支援，但事件驅動契約（message queue、streaming topic）的 AsyncAPI 生態還很早期。這個專案嘗試自己實作這個 emitter，讓 HTTP 與非同步契約可以共存在同一個 TypeSpec workspace。

## 環境需求

- Node.js >= 20
- [pnpm](https://pnpm.io/)（由 `devEngines` 管理，^11）

## 安裝

尚未發佈到 npm。若要在本機試用：

```bash
git clone <this repo>
cd typespec-asyncapi
pnpm install
pnpm build
```

接著在你的 TypeSpec 專案中引用（例如透過 `file:` dependency 或 `pnpm link`）。

## 使用方式

在 `tspconfig.yaml` 加入 emitter：

```yaml
emit:
  - "typespec-asyncapi"
options:
  "typespec-asyncapi":
    output-file: "asyncapi.yaml"
```

或直接用 CLI：

```bash
tsp compile . --emit typespec-asyncapi
```

### Emitter 選項

| 選項          | 型別     | 預設值          | 說明               |
| ------------- | -------- | --------------- | ------------------ |
| `output-file` | `string` | `asyncapi.yaml` | 輸出檔案的名稱。 |

## 開發

```bash
pnpm install        # 安裝依賴
pnpm build          # 編譯 TypeScript 到 dist/
pnpm watch          # watch 模式編譯
pnpm test           # 執行測試（vitest）
pnpm lint           # eslint
pnpm format         # prettier
pnpm docs           # 產生 API 文件（typedoc）
```

其他工具：

- **api-extractor** — API report / rollup（`pnpm api-extractor:local`）
- **knip** — 偵測未使用的程式碼與依賴（`pnpm knip`）
- **husky + lint-staged** — pre-commit lint 與 format

## Roadmap

- [ ] channel、operation（publish / subscribe）、message 的 decorator
- [ ] 將 TypeSpec model 對應為 AsyncAPI message payload schema
- [ ] AsyncAPI 3.0 輸出
- [ ] Server / protocol binding（Kafka 優先）
- [ ] YAML 輸出與多檔案支援
- [ ] 發佈到 npm

## 授權

[MIT](./LICENSE)
