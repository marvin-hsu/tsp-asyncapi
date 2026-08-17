# 貢獻指南

English version: [CONTRIBUTING.md](./CONTRIBUTING.md)

感謝你關注這個專案。

## 動手之前

除了錯字，其餘改動請先開一個 issue。先討論可以省下寫完才發現方向不合的成本。

回報錯誤時，最有用的內容是三樣。產生錯誤輸出的 TypeSpec 原始碼、emitter 實際寫出的
文件、以及你預期的文件。

## 環境設定

本專案需要 Node 20 以上與 pnpm。

```bash
pnpm install
pnpm build
pnpm test
```

`pnpm install` 會一併安裝 git hook。

## 唯一重要的指令

```bash
pnpm check
```

這是驗收入口。它依序跑九個步驟：format 檢查、lint、型別檢查、knip、建置、
API 報告檢查、測試與覆蓋率、套件檢查、正式相依套件的安全稽核。CI 跑的是同一個指令。
本機這條綠了，CI 就不會有新消息。

**用 exit code 判斷成敗，不要讀輸出自行判斷。** `tsc` 的輸出帶色碼，跳脫字元落在
`error` 和錯誤代碼之間。所以 grep `error TS` 永遠不會命中，即使建置真的失敗。

## 開發過程

`pnpm test:watch` 只重跑受你改動影響的測試。

**decorator 是從 `dist/` 執行的，不是 `src/`。** `lib/main.tsp` 匯入
`../dist/src/tsp-index.js`，所以 compiler 載入的是建置產物。測試 decorator 之前先跑 `pnpm build`。
否則你驗到的是改動前的程式碼。

## 測試

每個 diagnostic 都要有測試斷言它的代碼。每個輸出欄位都要有測試。

**測試通過不等於規則受保護。** 信任一個測試之前，先把它描述的規則改壞，確認它會轉紅。
這個專案出現過這種情況：測試照樣通過，而它描述的程式碼早已被刪掉。

單元測試鏡射原始碼結構。測試檔超過 850 行就依關注點拆成子目錄。

## 註解與文件

程式碼註解一律用英文，遵循 ASD-STE100：短句、一句一個概念、主動語態。要保留說明。
這是風格規則，不是刪減內容的理由。

**不要在註解裡寫檔案路徑。** 檔案會搬家，而且沒有任何工具會提醒你那個註解已經指向
不存在的東西。

使用者文件要寫兩份，`docs/` 一份、`docs/zh-tw/` 一份。兩頁都要加進
`docs/.vitepress/config.mts` 各自 locale 的 sidebar。跑 `pnpm docs:build`，
修掉它回報的 dead link。

**不要寫出不存在的 decorator、emitter 選項或 diagnostic 代碼。** 動筆前先對照
`src/lib.ts` 與 `lib/main.tsp`。

## Commit

Commit 訊息遵循 Conventional Commits，由 `commit-msg` hook 檢查。

訊息內文寫給一年後讀它的人看。先說原本哪裡有問題，再說這次改了什麼，最後說你怎麼
確認它可行。

## Pull request

一個 pull request 只處理一件事。

開之前確認：

- `pnpm check` exit 0。
- 新行為有測試，而且你**看過那個測試失敗**。
- 若使用者看得到這次改動，兩個語系的文件都更新了。

`pre-push` hook 會做型別檢查並跑測試。它會擋下 merge commit，因為本儲存庫維持線性
歷史。請用 rebase，不要 merge。

**永遠不要用 `--no-verify`。**

## 新增 decorator

先讀官方的 `@typespec/openapi3` 與 `@typespec/json-schema`。兩者已經解決過許多本專案
同樣會遇到的問題。在合理範圍內對齊它們的 decorator 簽章與 state 形狀。

decorator 放進 `src/decorators/` 底下對應文件區塊的資料夾。

**emitter 無法表達的內容，一律回報，不要猜。** 發警告並省略該欄位，或發錯誤拒絕。
絕不靜默改寫作者的意圖。每個 diagnostic 都要說明改怎麼寫。

## 發佈

維護者以推 tag 發佈：

```bash
git tag v0.2.0
git push origin v0.2.0
```

tag 決定版號。release workflow 會把版號寫進 `package.json`、重跑一次 `pnpm check`、
帶 provenance 發佈到 npm，最後把版號 commit 回 `main`。
