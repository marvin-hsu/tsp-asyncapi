# 變更紀錄

這個套件遵循[語意化版本](https://semver.org/lang/zh-TW/)。它還在 `0.x`，
所以 minor 版本可能帶 breaking change。有的話會寫在該筆的開頭。

English: [CHANGELOG.md](./CHANGELOG.md)

## 0.4.0

首次發布。這個套件是 `tsp-asyncapi` 的 decorator 那一半，拆出來讓多個 emitter
可以共用同一套輸入語言。

版本從 `0.4.0` 起算而不是 `0.1.0`，是為了對齊它拆離的那個 emitter。兩者一起
發布，而且用 workspace 協定互相相依，所以兩個版本號分開走只會造成困惑。等第二個
emitter 有自己的發布節奏，再讓版本分岔。

匯出的內容：

- 56 個 decorator。宣告在 `lib/main.tsp`，實作在這裡。
- 每一種 decorator state 的讀取函式：24 個函式與 51 個型別。
- `resolveService`，它產出語意模型，以及模型中每個節點的型別。
- `$lib` 與全部 103 個 diagnostic、`reportDiagnostic`、`createDiagnostic`、
  `LIBRARY_NAME`、`PACKAGE_NAME`。
- 作者直接書寫的文件物件型別，放在 `./types`。涵蓋每個通訊協定的 binding 物件、
  安全機制、tag 與範例。
- 測試主機，放在 `./testing`。它只載入 decorator。

關於邊界的兩點：

- `LIBRARY_NAME` 是 `tsp-asyncapi`，不是這個套件的名稱。它是每個 diagnostic
  代碼的前綴，而那些代碼沒有改名。
- 語意模型與共用工具函式之所以匯出，是因為另一個套件裡的 emitter 需要它們。
  它們現在是公開承諾，minor 版本可能改動。
