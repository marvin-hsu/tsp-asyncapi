---
title: "Schema 轉換"
description: "emitter 怎麼把每種 TypeSpec 構件轉成 AsyncAPI Schema Object，一種構件一頁。"
---

# Schema 轉換

emitter 如何把每種 TypeSpec 構件轉換成 [AsyncAPI Schema Object](https://www.asyncapi.com/docs/reference/specification/v3.0.0#schemaObject)（JSON Schema draft-07 的超集）。用在 message payload 上的構件會寫進 `components.schemas`。以下各頁的輸出都由轉換器實際產生，不是手寫的。
