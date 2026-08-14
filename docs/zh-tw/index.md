---
layout: home

hero:
  name: TypeSpec AsyncAPI
  text: TypeSpec 的 AsyncAPI 3.1 emitter
  tagline: 用 TypeSpec 描述事件驅動 API。從單一事實來源產出 AsyncAPI 文件。
  actions:
    - theme: brand
      text: 快速開始
      link: /zh-tw/guide/getting-started
    - theme: alt
      text: Schema 轉換參考
      link: /zh-tw/guide/schema-conversion
    - theme: alt
      text: GitHub
      link: https://github.com/marvin-hsu/typespec-asyncapi

features:
  - title: 單一事實來源
    details: HTTP API 與非同步 API 共用同一個 TypeSpec workspace。同一組 model 可以產出 OpenAPI 與 AsyncAPI。
  - title: 經過驗證的轉換規則
    details: 文件裡每一組輸入輸出對照都由轉換器實際產生。涵蓋 model、scalar、enum、union、繼承、discriminator 與驗證關鍵字。
  - title: 不靜默丟棄
    details: emitter 無法表達的內容，一律以警告省略或回報錯誤，絕不靜默改寫。每個診斷都附上原因與修法。
---

::: warning 開發中
emitter 目前產出文件骨架與完整的 `info` 區塊。schema 轉換層已實作並有單元測試，但尚未接進輸出。channel、operation、message、server 與 protocol binding 仍在開發。[現在能拿到什麼 →](/zh-tw/guide/getting-started#emitter-現在產出什麼)
:::
