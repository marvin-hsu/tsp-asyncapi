# 快速開始

`tsp-asyncapi` 是 [TypeSpec](https://typespec.io/) 的 [AsyncAPI 3.1](https://www.asyncapi.com/) emitter。你用 TypeSpec 描述事件驅動 API。emitter 從這份單一事實來源產出 AsyncAPI 文件。

## emitter 現在產出什麼

這個專案還在開發中。先弄清楚現在拿得到什麼、還拿不到什麼。

| AsyncAPI 文件的部分                                                             | 狀態                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 文件骨架（`asyncapi`、`id`、`defaultContentType`）                              | ✅ 已輸出                                                                            |
| `info` 區塊：title、version、description、contact、license、tags、external docs | ✅ 已輸出                                                                            |
| `channels`、`operations`、`messages`                                            | ✅ 已輸出。見 [Request 與 Reply](./request-reply)。                                  |
| `components.schemas`（model → schema 轉換）                                     | 🚧 轉換層已實作並有完整單元測試，但尚未接進輸出檔。它會和 message payload 一起接上。 |
| server、security、protocol binding（Kafka 優先）                                | 🚧 規劃中                                                                            |

簡言之：你現在就能用 TypeSpec 建模事件契約，拿到一份合規的 AsyncAPI 3.1.0 文件與完整的 `info` 中繼資料。設計 model 時可以依 [Schema 轉換](./schema-conversion) 的規則進行。這些規則穩定且有測試。message 支援接上後，你的 model 會原樣進入文件。

## 環境需求

- Node.js >= 20
- [pnpm](https://pnpm.io/)（本專案的 `devEngines` 欄位鎖定 ^11）

## 安裝

這個套件尚未發佈到 npm。若要在本機試用：

```bash
git clone https://github.com/marvin-hsu/tsp-asyncapi.git
cd tsp-asyncapi
pnpm install
pnpm build
```

接著在你的 TypeSpec 專案以本機依賴引用：

```json
// 你的 TypeSpec 專案的 package.json
{
  "dependencies": {
    "tsp-asyncapi": "file:../tsp-asyncapi"
  }
}
```

（也可以用 `pnpm link`。）

## 產出第一份 AsyncAPI 文件

建立 `main.tsp`：

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
namespace Orders;
```

在 `tspconfig.yaml` 設定 emitter：

```yaml
emit:
  - "tsp-asyncapi"
options:
  "tsp-asyncapi":
    asyncapi-id: "urn:com:example:orders"
    default-content-type: "application/json"
```

執行編譯：

```bash
tsp compile .
```

輸出檔在 `tsp-output/tsp-asyncapi/asyncapi.yaml`。以下是上面範例**實際的完整輸出**：

```yaml
asyncapi: 3.1.0
id: urn:com:example:orders
info:
  title: Order Service API
  version: 1.0.0
  description: This is a sample Order Service event-driven API.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
  tags:
    - name: payment
    - name: orders
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
defaultContentType: application/json
channels: {}
operations: {}
components: {}
```

## 每一行從哪來

| 輸出欄位                                                              | 來源                                                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `id`                                                                  | emitter 選項 `asyncapi-id`                                                             |
| `info.title`                                                          | `@service(#{ title: ... })`                                                            |
| `info.version`、`description`、`contact`、`license`、`termsOfService` | `@info(#{ ... })`                                                                      |
| `info.description`（後備）                                            | namespace 上的 `@doc` 或 `/** ... */` 文件註解。只在 `@info` 沒給 description 時使用。 |
| `info.tags`                                                           | 每個 `@tag` 產生一筆                                                                   |
| `info.externalDocs`                                                   | `@externalDocs(url, description?)`                                                     |
| `defaultContentType`                                                  | emitter 選項 `default-content-type`                                                    |

若沒有 `@service`，文件仍會輸出。`info` 後備為 `{ title: "AsyncAPI Document", version: "0.0.0" }`。若程式裡有多個 `@service`，emitter 發出 `multiple-services` 警告並採用第一個。

## 下一步

- 依 [Schema 轉換](./schema-conversion) 的規則設計事件 payload model。每個構件都有驗證過的輸入輸出對照。
- 到 [Emitter 選項](../reference/emitter-options) 查看所有設定。
- 到 [Decorator](../reference/decorators) 查看精確的簽章。
- 遇到警告或錯誤時，查 [診斷訊息](../reference/diagnostics)。
