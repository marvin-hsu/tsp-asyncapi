# tsp-asyncapi

[English](./README.md) | 繁體中文

[TypeSpec](https://typespec.io/) 的 [AsyncAPI 3.1](https://www.asyncapi.com/) emitter。用 TypeSpec 描述事件驅動 API，從單一事實來源（single source of truth）產出完整的 AsyncAPI 文件。

> **狀態：開發中。** 目前 emitter 產出文件骨架與 `info` 中繼資料（title、version、contact、license、tags、external docs）。TypeSpec → AsyncAPI schema 轉換層（model、scalar、array、record、enum、union、繼承、discriminator、驗證關鍵字）已實作並有單元測試，但尚未接進輸出檔，會與 message payload 一起接上。Channel、operation、message、server、security、protocol binding 仍在開發中。

📖 **文件請看 [docs 網站](https://marvin-hsu.github.io/tsp-asyncapi/)**：快速開始、經過驗證的 schema 轉換範例、完整的 decorator / 選項 / 診斷參考。提供英文與臺灣正體中文。

## 為什麼做這個

TypeSpec 對 OpenAPI 已有成熟的一級支援。事件驅動契約（message queue、streaming topic）這邊的 AsyncAPI 生態還很早期。這個專案實作這個 emitter，讓 HTTP API 跟非同步 API 可以共存在同一個 TypeSpec workspace。

## 環境需求

- Node.js >= 20
- [pnpm](https://pnpm.io/)（本專案的 `devEngines` 欄位鎖定 ^11）

## 安裝

尚未發佈到 npm。若要在本機試用：

```bash
git clone <this repo>
cd tsp-asyncapi
pnpm install
pnpm build
```

接著在你的 TypeSpec 專案中引用，可以用 `file:` dependency 或 `pnpm link`。

## 使用方式

在 `main.tsp` 匯入這個 library，用提供的 decorator 標註你的 service：

```typespec
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Order Service API" })
@info(#{
  version: "1.0.0",
  description: "This is a sample Order Service event-driven API.",
  contact: #{ name: "API Support", email: "support@example.com" },
  license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
})
@tag("orders")
@tag("payment")
@externalDocs("https://example.com/docs", "Service Documentation")
@server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
namespace Orders;

// schema 轉換層會把這個 model 轉成 AsyncAPI Schema Object（見 docs 網站）。
// message payload 接上後，結果會放進 components.schemas。
model Order {
  id: string;
  amount: float64;
  items: OrderItem[];
  metadata: Record<string>;
}

model OrderItem {
  productId: string;
  quantity: int32;
}
```

在 `tspconfig.yaml` 設定 emitter：

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    output-file: "asyncapi.yaml"
    file-type: "yaml"
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

或直接編譯：

```bash
tsp compile . --emit tsp-asyncapi
```

這會產生一份完整合規的 AsyncAPI 3.1.0 文件。

## Emitter 選項

在 `tspconfig.yaml` 設定，或透過 CLI 參數傳入：

| 選項                   | 型別     | 預設值          | 說明                                                          |
| ---------------------- | -------- | --------------- | ------------------------------------------------------------- |
| `output-file`          | `string` | `asyncapi.yaml` | 輸出檔案的名稱。                                              |
| `file-type`            | `string` | `yaml`          | 輸出格式：`yaml` 或 `json`。                                  |
| `asyncapi-id`          | `string` | -               | 文件的全域識別碼，對應 `id` 欄位。                            |
| `default-content-type` | `string` | -               | 訊息 payload 的預設 content type，對應 `defaultContentType`。 |

## Schema 轉換

這個 emitter 會自動把 TypeSpec 的 model、scalar、enum、union 轉換成 AsyncAPI Schema Object。目前支援：

- Model，包含巢狀 model、array、`Record<T>`。
- Scalar，包含 TypeSpec 內建的數值/字串/日期 scalar，以及使用者自訂的衍生 scalar。
- Enum 與 union，包含字串字面值 union 與 `T | null`。
- 繼承（`extends`）與 `@discriminator`，對應到 `allOf` 與 `discriminator` 欄位。
- 驗證關鍵字：`@minLength`、`@maxLength`、`@minValue`、`@maxValue`、`@minItems`、`@maxItems`、`@pattern` 等相關 decorator。
- 文件：`@doc`、`@summary`、`@example`。
- `@encodedName`，用來改寫屬性的線上格式（wire-format）key。
- Template 具現化的穩定命名（依參數推導），例如 `Page<string>` 會在 `components.schemas` 裡變成 `PageString`。

兩個宣告的名稱撞在一起時，會回報一個 diagnostic 錯誤，不會自動幫任一方改名。

## 可用的 Decorator

- `@AsyncAPI.info` — 設定完整的 AsyncAPI `info` 區塊：version、description、contact、license。
- `@AsyncAPI.externalDocs` — 附加外部文件連結。
- `@AsyncAPI.oneOf` — 標註在 union 上，輸出 `oneOf` 取代預設的 `anyOf`。
- `@AsyncAPI.jsonSchemaExtension` — 加入一個沒有專屬 decorator 對照的 JSON Schema 關鍵字，例如 `@jsonSchemaExtension("unevaluatedProperties", false)`。可重複套用，每次加一組 key/value。
- `@tag` — 內建。為文件加上標準 tag。
- `@service` — 內建。自動取出 API 標題。

## 開發

```bash
pnpm install        # 安裝依賴。
pnpm build          # 編譯 TypeScript 到 dist/。
pnpm watch          # watch 模式編譯。
pnpm test           # 執行測試（vitest）。
pnpm lint           # 執行 eslint。
pnpm format         # 執行 prettier。
pnpm docs:dev       # 在本機啟動文件站台（VitePress）。
pnpm docs:build     # 建置文件站台。
```

文件站台放在 `docs/`，以 [VitePress](https://vitepress.dev/) 建置。提供英文與臺灣正體中文。push 到 `main` 會部署到 GitHub Pages。

其他工具：

- **api-extractor** — 追蹤公開 API 介面（`pnpm api-extractor:local`）。
- **knip** — 找出未使用的程式碼與依賴（`pnpm knip`）。
- **husky + lint-staged** — 每次 commit 前執行 lint 與 format 檢查。

## Roadmap

- [x] 文件骨架、`info`、tags、external docs。
- [x] TypeSpec → AsyncAPI schema 轉換（model、scalar、array、record、enum、union、繼承、驗證）。
- [ ] Channel、operation（send/receive）、message 的 decorator。
- [ ] 將 TypeSpec model 對應為 AsyncAPI message payload。
- [ ] Server 與 protocol binding，優先支援 Kafka。
- [ ] 發佈到 npm。

## 授權

[MIT](./LICENSE)
