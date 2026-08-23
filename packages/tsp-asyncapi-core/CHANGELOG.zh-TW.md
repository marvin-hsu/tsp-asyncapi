# 變更紀錄

這個套件遵循[語意化版本](https://semver.org/lang/zh-TW/)。它還在 `0.x`，
所以 minor 版本可能帶 breaking change。有的話會寫在該筆的開頭。

English: [CHANGELOG.md](./CHANGELOG.md)

## 0.1.0

首次發布。這個套件是 `tsp-asyncapi` 的 decorator 那一半,拆出來讓多個 emitter
可以共用同一套輸入語言。

它與任何 emitter 獨立發版。`tsp-asyncapi` 用 `~` 範圍相依它,所以這裡發一個
minor 不會自動進到 emitter,要那個 emitter 自己取用。兩者版號起點不同就是這個
原因:這個套件是新的,`0.1.0` 如實反映。

匯出的內容:

- 56 個 decorator。宣告在 `lib/main.tsp`,實作在這裡。
- 每一種 decorator state 的讀取函式:24 個函式與 51 個型別。
- `$lib` 與全部 103 個 diagnostic、`reportDiagnostic`、`createDiagnostic`、
  `LIBRARY_NAME`、`PACKAGE_NAME`。
- 規格導出的常數,以及 emitter 需要的命名與序列化工具函式。
- 作者直接書寫的文件物件型別,放在 `./types`。涵蓋每個通訊協定的 binding 物件、
  安全機制、tag 與範例。
- 語意模型,放在 `./unstable`。它的形狀預期會變,入口名稱就是那個警告。
- 測試主機,放在 `./testing`。它只載入 decorator。

關於邊界的兩點:

- `LIBRARY_NAME` 是 `tsp-asyncapi`,不是這個套件的名稱。它是每個 diagnostic
  代碼的前綴,而 emitter 拆成兩個套件時那些代碼沒有改名。
- 主入口的每一個名稱都是 semver 承諾,包含常數與工具函式。只有 `./unstable` 例外。
