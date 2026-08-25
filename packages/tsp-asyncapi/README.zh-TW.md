# tsp-asyncapi

把 TypeSpec 編譯成 AsyncAPI 3.1 文件。

```bash
npm install tsp-asyncapi
```

```yaml
# tspconfig.yaml
emit:
  - "tsp-asyncapi"
```

```typespec
import "tsp-asyncapi";

using AsyncAPI;
```

Decorator 來自 [`tsp-asyncapi-core`][core]，這個套件相依它。只裝這一個就夠，
而且一行 import 就帶進所有 decorator。

## 內容

| 部分       | 是什麼                         |
| ---------- | ------------------------------ |
| lower 階段 | 把語意模型轉成 AsyncAPI 物件樹 |
| 文件型別   | 每個輸出物件的 TypeScript 形狀 |
| `$onEmit`  | 把文件寫成 YAML 或 JSON        |

## Emitter 選項

五個，全部選填：`output-file`、`file-type`、`asyncapi-id`、
`default-content-type` 與 `preview-features`。[參考文件][options]逐項說明。

## 穩定性

這個套件遵循[語意化版本](https://semver.org/)。它還在 `0.x`，所以次版本更新可能
帶有破壞性變更。有這種變更時，changelog 會寫在該筆條目的最前面。

## 文件

指南、decorator 參考、binding 參考，以及每一個 diagnostic 代碼：
<https://marvin-hsu.github.io/tsp-asyncapi/>

repo 的 README 有完整的功能對照表與缺口清單，包含這個 emitter 不做的項目。

English: [README.md](./README.md)

## 授權

MIT

[core]: https://www.npmjs.com/package/tsp-asyncapi-core
[options]: https://marvin-hsu.github.io/tsp-asyncapi/reference/emitter-options
