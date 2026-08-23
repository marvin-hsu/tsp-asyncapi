# tsp-asyncapi-core

[`tsp-asyncapi`][emitter] 背後的 decorator 與語意模型。

這個套件宣告輸入語言。它不產出任何東西：沒有註冊 `$onEmit`，也不寫檔案。
`@typespec/http` 就是同一種形狀。

## 你大概不需要這個套件

要產出 AsyncAPI 文件，請改裝 [`tsp-asyncapi`][emitter]。它相依這個套件並
轉接每一個 decorator，所以 `.tsp` 檔只要寫 `import "tsp-asyncapi";`
就全部拿得到。

```bash
npm install tsp-asyncapi
```

有兩種情況才直接裝這個套件：

- 你要寫一個工具，讀取作者宣告了什麼，但不產出文件。所有 decorator state
  的讀取函式都從這裡匯出。
- 你要為同一套輸入語言寫另一個 emitter。

## 內容

| 部分           | 是什麼                                             |
| -------------- | -------------------------------------------------- |
| `lib/main.tsp` | 全部 56 個 `extern dec` 宣告，以及它們接受的 model |
| Decorator      | 實作。它們把 state 記在 program 上                 |
| resolve 階段   | 把 program 與那些 state 轉成一份語意模型           |
| Diagnostic     | 全部 103 個代碼，含 emitter 回報的那些             |

## library 名稱不是套件名稱

這個 library 向 TypeSpec compiler 註冊的名稱是 `tsp-asyncapi`，不是
`tsp-asyncapi-core`。那個名稱是每個 diagnostic 代碼的前綴，而那些代碼寫進
文件、也被依賴。把 emitter 拆成兩個套件不是改名的理由。

需要那個註冊名稱時用 `LIBRARY_NAME`。需要指名套件時用 `PACKAGE_NAME`，
例如請 compiler 載入這個 library 的時候。

## 穩定性

匯出的名稱包含語意模型，以及 emitter 需要的工具函式。它們是公開承諾，而這個
套件是 `0.x`，所以 minor 版本可能改動它們。`tsp-asyncapi` 產出的文件不受影響。

## 文件

指南與參考文件涵蓋兩個套件：<https://marvin-hsu.github.io/tsp-asyncapi/>

English: [README.md](./README.md)

## 授權

MIT

[emitter]: https://www.npmjs.com/package/tsp-asyncapi
