---
title: "Schema 轉換"
description: "emitter 怎麼把每種 TypeSpec 構件轉成 AsyncAPI Schema Object，一種構件一頁。"
---

# Schema 轉換

本頁是參考文件：說明 emitter 如何把每種 TypeSpec 構件轉換成 [AsyncAPI Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#schemaObject)（JSON Schema draft-07 的超集）。以下每個輸出都由轉換器實際產生，不是手寫的。

::: warning 尚未接進輸出檔
轉換層已實作並有單元測試覆蓋，但**尚未接進 `tsp compile` 的輸出**。目前輸出文件的 `components` 是空的。message payload 落地時會接上（見 [roadmap](https://github.com/marvin-hsu/tsp-asyncapi#roadmap)）。你現在就能依本頁設計 model。接上後，schema 會以本頁所示的樣子出現在 `components.schemas`。
:::
