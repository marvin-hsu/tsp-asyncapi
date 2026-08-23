# 安全政策

English version: [SECURITY.md](./SECURITY.md)

## 支援的版本

本專案處於 0.x 階段，只有最新版會收到修正。回報之前請先升級，並確認問題仍然存在。

| 版本          | 是否支援 |
| ------------- | -------- |
| 最新的 0.x 版 | 是       |
| 更舊的版本    | 否       |

## 回報漏洞

請透過 GitHub 的私密管道回報：
[Security → Report a vulnerability](https://github.com/marvin-hsu/tsp-asyncapi/security/advisories/new)。

**不要用公開 issue 回報漏洞。** 公開 issue 會在修好之前先讓所有人知道問題。

請附上觸發問題的 TypeSpec 原始碼、emitter 寫出的文件，以及攻擊者能藉此取得什麼。
一份附上輸入的回報，勝過好幾份只有描述的回報。

七天內會收到第一次回覆。本專案由單一維護者維護，修復需要多久就是多久，但過程會讓你
知道。

## 屬於範圍內的問題

這是一個建置期工具。它讀 TypeSpec 原始碼、寫出 AsyncAPI 文件。它在開發機或建置環境
中執行，不對外提供服務。

以下屬於範圍內：

- emitter 寫出原始碼未提供的內容，造成資訊外洩。
- 編譯某個原始檔會執行該檔未宣告的程式碼。
- 特製的原始碼讓 emitter 寫到輸出目錄之外。
- 已發佈套件的相依套件帶有已知漏洞。

## 不屬於範圍內的問題

- 輸出的文件描述了不安全的設計。emitter 只寫出作者宣告的內容，不審查設計。
- 規格允許、而且作者自己選擇的 `security` 欄位或 security scheme。
- emitter 收到無法表達的輸入並回報 diagnostic。那是刻意的行為。

## Provenance

多數版本都帶 npm provenance 發佈。該簽章把 tarball 綁定到這個儲存庫，以及建置它的那
一次 workflow 執行。

0.1.4 到 0.3.0 有帶。0.4.0、0.4.1、0.4.2 沒有：發布改用 `changeset publish` 之後
`--provenance` 旗標掉了，而且沒有東西檢查。0.4.2 之後的版本恢復帶簽章，發布流程現在
也會在 registry 說沒有時失敗。

驗證下載內容：

```bash
npm audit signatures
```
