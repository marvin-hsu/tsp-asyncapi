# tsp-asyncapi-core

[![npm](https://img.shields.io/npm/v/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core)
[![downloads](https://img.shields.io/npm/dm/tsp-asyncapi-core.svg)](https://www.npmjs.com/package/tsp-asyncapi-core)
[![Node.js](https://img.shields.io/node/v/tsp-asyncapi-core)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi) 背後的 decorator 與語意模型，本身不產出任何檔案。

> **注意：** 要產出 AsyncAPI 文件請使用 [`tsp-asyncapi`](https://www.npmjs.com/package/tsp-asyncapi)，不是這個套件。
> 它會一併帶入這裡的全部 decorator，`.tsp` 檔只要寫 `import "tsp-asyncapi";`。
>
> 目前在 `0.x`，次版本可能更動匯出的名稱。`tsp-asyncapi` 產出的文件不受影響。

## 什麼時候需要直接安裝

- 做一個只讀宣告內容、不產出文件的工具。decorator state 的讀取函式都由這裡匯出。
- 為同一套輸入語言另外寫一個 emitter。這裡的 resolve 階段會把 program 與
  decorator state 轉成一份語意模型，可以直接接手。

```bash
npm install tsp-asyncapi-core
```

## 其他

- [文件](https://tsp-asyncapi.marvinhsu.dev/)
- [GitHub repo](https://github.com/marvin-hsu/tsp-asyncapi)

English: [README.md](./README.md)

## 授權

MIT
