## What this changes / 這次改了什麼

<!--
What was wrong or missing, then what this does about it.
原本哪裡有問題或缺什麼，然後這次改動做了什麼。
-->

## How you know it works / 你怎麼確認它可行

<!--
Name the test, or the command you ran and what it printed. If you changed
emitted output, paste the before and after.

寫出測試名稱，或你跑的指令與它的輸出。若輸出的文件有變，貼出前後對照。
-->

## Checklist / 檢查清單

- [ ] `pnpm check` exits 0. / `pnpm check` exit 0。
- [ ] New behaviour has a test, and I have seen that test fail without the
      change. / 新行為有測試，而且我看過那個測試在沒有這次改動時失敗。
- [ ] Every new diagnostic has a test that asserts its code. /
      每個新的 diagnostic 都有測試斷言它的代碼。
- [ ] Documentation is updated in both `docs/` and `docs/zh-tw/`, if a user
      would notice this change. / 若使用者看得到這次改動，
      `docs/` 與 `docs/zh-tw/` 兩邊都更新了。
- [ ] No decorator, emitter option, or diagnostic code is named anywhere
      unless it exists in `src/`. / 文中提到的 decorator、emitter 選項、
      diagnostic 代碼都確認存在於 `src/`。
- [ ] Commits follow Conventional Commits. / Commit 遵循 Conventional Commits。

## Anything you are unsure about / 有沒有不確定的地方

<!--
A design choice you want a second opinion on, or a case you could not
reach with a test. Saying so is more useful than leaving it out.

你想聽第二意見的設計選擇，或你無法用測試涵蓋的情況。
寫出來比略過有用。
-->
