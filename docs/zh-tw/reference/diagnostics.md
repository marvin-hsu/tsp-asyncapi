# 診斷訊息

本頁列出 emitter 會回報的所有警告與錯誤，附原因與修法。診斷代碼在 compiler 輸出中顯示為 `tsp-asyncapi/<code>`。

所有診斷共用一條設計原則：**emitter 絕不靜默丟棄或靜默改寫你的意圖。** 無法表達的內容，一律以警告省略，或回報錯誤。

## 錯誤

### `duplicate-schema-key`

> Duplicate schema name: '\<name\>'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.

兩個宣告解析到同一個 `components.schemas` key。常見原因：兩個 `@friendlyName` 解析成同一字串；或 model 名稱撞到 template 具現化的推導名稱（例如已宣告 `model PageString`，又使用 `Page<string>`）。

**修法：** 改掉其中一個宣告的名稱，或給其中一個不同的 `@friendlyName`。emitter 絕不自動改名。

### `unsupported-payload-type`

> This emitter does not support a \<kind\> here. Use a model, scalar, enum, union, or literal value instead.

屬性或 payload 位置指到 schema 層無法轉換的 TypeSpec 實體，例如 `Interface`、`Namespace`、`Operation`。compiler 本身不會拒絕這種寫法，只有 emitter 會。

**修法：** 改用 model、scalar、enum、union 或字面值型別。

### `unrepresentable-circular-reference`

> This anonymous type refers back to itself with no named type in between. A plain (non-$ref) schema cannot express that cycle. Give the type a name so it can be referenced through $ref instead.

匿名型別繞回自己，例如 `alias Foo = { a: Foo };`。匿名型別只能內聯（沒有 `components.schemas` 項目），而內聯 schema 無法表達循環。

**修法：** 把匿名型別改成具名 `model`。具名型別之間以 `$ref` 互相引用，循環沒有問題。

### `duplicate-message-key`

> Duplicate message name: '\<name\>'. Two @message models resolve to the same components.messages key. Pass an explicit name to @message on one of them.

兩個 `@message` model 解析到同一個 `components.messages` key。常見原因：不同 namespace 下的同名 model（message key 不帶 namespace 前綴，schema key 會帶）；或兩個 `@friendlyName` 解析成同一字串。

同一個 template 的兩個具現化算出同一個 key 不會回報——原始碼裡只有一個 `@message`，兩者也指向同一份輸出的 component。

**修法：** 對其中一個的 `@message` 傳入明確名稱。

### `duplicate-message-decorator`

> @message is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @message.

`@message` 不可重複標記。疊加時只會保留其中一次，其餘名稱不會進到文件裡。

**修法：** 移除多餘的 `@message`。

### `duplicate-content-type-decorator`

> @contentType is applied to this model more than once. A message carries one content type, so only one application takes effect and the rest are discarded. Remove the extra @contentType.

`@contentType` 不可重複標記。一個 message 只有一個 `contentType` 欄位。疊加時只會保留其中一次，其餘的值會被靜默丟棄。

**修法：** 移除多餘的 `@contentType`。

### `empty-content-type`

> @contentType was given an empty media type. A blank media type names no format, so it cannot reach the emitted message. This @contentType was dropped, and the message falls back to the document defaultContentType. Give it a media type, such as 'application/json'.

[`@contentType`](./decorators#contenttype) 收到空字串。空白的媒體型態沒有指出任何格式，emitter 無法把它寫進 message。

這個 message 會退回文件層級的 `defaultContentType`。結果與沒有寫 `@contentType` 相同。使用者是刻意輸入空字串的，所以這個退回會回報出來，不會靜默發生。

**修法：** 給這個 decorator 一個媒體型態，例如 `application/json`，或是移除它。

### `duplicate-headers-decorator`

> @headers is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @headers.

`@headers` 不可重複標記。疊加時只會保留其中一次，其餘 headers model 不會進到文件裡。

**修法：** 移除多餘的 `@headers`。

### `duplicate-message-headers`

> This message takes its headers from two sources: a field marked @header, and a model given to @headers. There is no rule that picks one over the other, so no `headers` were emitted at all. Keep one of the two sources.

同一個 message 宣告了兩次 headers：至少一個欄位標了 `@header`，該 model 又標了 `@headers`。emitter 不定義兩者的優先序，所以兩邊都不輸出。被標記的欄位留在 payload，錯誤修好之前不會有任何你寫的東西消失。

**修法：** 只留一個來源。把被標記的欄位搬進 `@headers` 的 model，或移除 `@headers`。

### `headers-not-object`

> The model '\<name\>' given to @headers is backed by an array. AsyncAPI requires the headers schema to be a key/value map, so no `headers` were emitted. Pass a model with properties instead.

傳給 `@headers` 的 model 會輸出 `type: "array"`。它以 array 為底（`is` 一個 array，或繼承自 array）。AsyncAPI 要求 `headers` schema 描述一組 key/value map。

**修法：** 改傳一個有屬性的 model，或以 `Record<T>` 為底的 model。兩者都輸出 object schema。

### `content-type-header-conflict`

> The header '\<name\>' names the message content type, and this message also carries @contentType. AsyncAPI has one field for the content type, so two sources for it are ambiguous. Remove the @header field and keep @contentType.

某個 header 欄位名為 `content-type`（比對用輸出的欄位名，且不分大小寫），而同一個 message 又標了 `@contentType`。AsyncAPI 的 content type 有專屬欄位，兩個來源無法同時成立。`@typespec/http` 會把這種 header 重新分類，因為 HTTP 沒有別的管道可以表達；本 emitter 有 `@contentType`，所以直接回報而不自行挑選。

兩種 headers 機制都會檢查。該欄位可以是 message model 上標了 `@header` 的欄位，也可以是傳給 `@headers` 的 model 的屬性，包含該 model 繼承來的屬性。

**修法：** 移除該 header 欄位，保留 `@contentType`。

### `duplicate-correlation-id-decorator`

> @correlationId is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @correlationId.

`@correlationId` 不可重複套用。疊加後只有一次生效，其他的 location 不會進入文件。

**修法：** 移除多餘的 `@correlationId`。

### `invalid-correlation-id-location`

> '\<location\>' is not a legal correlation id location, so no `correlationId` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/MQMD/CorrelId'.

這個 location 不符合 AsyncAPI runtime expression 的文法。運算式以 `$message.header` 或 `$message.payload` 開頭，後面接一個 `#`。`#` 之後是一段 JSON Pointer，所以必須是空字串或以 `/` 開頭。

`#` 是必要的。規格的 ABNF 條文看起來像是 fragment 可省略，但規格的正規 JSON Schema 要求 `#`。官方 AsyncAPI parser 依 JSON Schema 判定，會拒絕帶有 `$message.header`（不含 `#`）的文件。

emitter 只檢查格式：pointer 可以指向任何 schema 都沒宣告的路徑，官方範例本身就這樣寫。

**修法：** 改寫成文法接受的 location，例如 `$message.header#/correlationId`。

### `empty-message-example`

> This @messageExample carries neither `headers` nor `payload`, so it shows nothing about the message. This example was dropped. Give it at least one of the two.

某次 `@messageExample` 套用給了空值，或只給了 `name` 與 `summary`。沒有內容的 Message Example Object 說明不了這個 message。

**修法：** 為該筆範例補上 `headers`、`payload`，或兩者都補。

### `empty-tag-name`

> @asyncTag was given an empty name. The `name` of an AsyncAPI Tag Object is required, and no consumer can match a blank one. This tag was dropped. Give it a name.

某次 [`@asyncTag`](./decorators#asynctag) 套用把空字串當成 tag 名稱。AsyncAPI Tag Object 的 `name` 是必填欄位，空白的名稱沒有任何 consumer 比對得到。

**修法：** 為該 tag 補上名稱。

### `conflicting-tag-metadata`

> Tag '\<name\>' is declared more than once here, with a different '\<field\>'. AsyncAPI emits one Tag Object per name on an object, so only one of the two values can be kept. The first one in source order was kept. Merge the @asyncTag applications into one, or give them different names.

同一個 target 上兩次套用 [`@asyncTag`](./decorators#asynctag) 指到同一個 tag 名稱，而且同一個欄位給了兩個不同的值。AsyncAPI 在一個物件上，同一個名字只輸出一個 Tag Object，兩個值必定有一個要被丟掉。emitter 回報這個歧義，不自行挑選。

若兩次套用設定的是*不同*欄位，則會合併；內建 `@tag` 與同名的 `@asyncTag` 也會合併。同一個名字出現在兩個*不同*的 target 上永遠不算衝突：AsyncAPI 讓每個物件各自持有獨立的 `tags` 陣列。

**修法：** 把兩次套用合併成一次，或改用不同的名字。

### `duplicate-server-name`

> Duplicate server name: '\<name\>'. Each @server on a namespace needs its own name, because the name is the key of that server in the emitted document. This @server was dropped, and the first one with this name in source order was kept.

同一個 namespace 上兩個 `@server` 用了同一個名稱。名稱就是 `servers` map 的 key，兩者會互相碰撞。emitter 絕不靜默挑一個。

**修法：** 改掉其中一個的名稱。

### `empty-server-field`

> Empty server field: '\<field\>'. AsyncAPI requires a value for this field on every server. This @server was dropped.

`host` 或 `protocol` 是空字串，或只有空白字元。兩者都是 Server Object 的必填欄位。空值可以通過型別檢查，卻會產出不合規的文件，因此整個 server 被丟棄。

**修法：** 給該欄位實際的值。

### `invalid-server-name`

> Invalid server name: '\<name\>'. AsyncAPI only allows letters, digits, '_', and '-' in a server name. This @server was dropped.

名稱超出 AsyncAPI 允許的根層 `servers` map key 字元集。此字元集比 Components Object 的更嚴格，不允許點號。

**修法：** 改用只含英文字母、數字、`_`、`-` 的名稱。emitter 絕不自動改名，因為那會靜默換掉你要求的 key。

## 警告

### `message-key-shadows-schema-key`

> Message name '\<name\>' is also the components.schemas key of a different type, so a reader can misread this message as describing that type. A message key drops the namespace prefix that a schema key keeps, which makes the two overlap. Pass a different name to @message.

文件本身仍然合法——`components.messages` 與 `components.schemas` 是兩個獨立的 map，實際上沒有撞到。風險在讀的人：`components.messages.Sales.Ev` 與 `components.schemas["Sales.Ev"]` 看起來像同一個東西，描述的卻是不同型別。

**修法：** 對 `@message` 傳入不同的名稱。

### `sanitized-message-key`

> Message name '\<requested\>' is not a legal components.messages key, so it was emitted as '\<emitted\>'. A key may only use the characters a-z, A-Z, 0-9, '.', '-', and '_'.

傳給 `@message` 的名稱超出 Components Object 的合法字元集，emitter 已把違規字元編碼。因此實際輸出的 key 並不是當初要求的字串。

**修法：** 改用只含 `a-z`、`A-Z`、`0-9`、`.`、`-`、`_` 的名稱。

### `nested-header-ignored`

> This @header marks a property that is not a top-level field of a @message model, so it stays in the payload schema. Only a top-level field is lifted into `headers`. Move the property to the message model, or describe the whole headers object with @headers.

`@header` 標到了 emitter 無法抽出的屬性：它在 payload 引用到的某個 model 裡面，而不在 message model 本身。一個 message 的 payload 是一個 object，headers 是它的同層物件。深一層的欄位沒有這種同層位置可以搬，硬抽會連帶改寫 payload 的結構。`@typespec/http` 也基於同樣理由只讀頂層的 metadata。

**修法：** 把該屬性搬到 message model 上，或用 `@headers` 描述整個 headers 物件。

### `inherited-header-ignored`

> This @header marks a property that '\<message\>' inherits through 'extends', so it stays in the payload schema. Only a property the message model declares itself is lifted into `headers`. Spread the base model with '...' instead of extending it, or describe the whole headers object with @headers.

`@header` 標到的屬性是 message 透過 `extends` 繼承來的。這種屬性在輸出的 payload 裡是頂層欄位，所以它有自己的訊息，不共用上一條。

base model 本身是獨立的宣告，每個繼承它的 model 都共用它，payload 也是用 `allOf` 引用它。從它裡面抽走一個欄位，會連帶改到其他所有使用者。展開語法 `...Base` 則是把屬性複製進 message model，那些欄位就成為 message 自己的欄位，會被抽取到 `headers`。

**修法：** 改用 `...` 展開 base model，或用 `@headers` 描述整個 headers 物件。

### `server-outside-service`

> Server '\<name\>' on namespace '\<namespace\>' was dropped. This emitter reads the servers of the service namespace only. Move this @server to the service namespace this document is emitted from.

`@server` 標在非本文件 service namespace 的 namespace 上。emitter 只讀 service namespace 的 server，來源與 `info` 相同。

**修法：** 把 `@server` 移到 service namespace，或用 `@@server` 從目前位置 augment 過去。

### `multiple-services`

> Multiple services found. AsyncAPI only supports one service per document. The first one will be used.

多個 namespace 都標了 `@service`。emitter 採用第一個，忽略其餘。

**修法：** 一次編譯保留一個 `@service`，或把 service 拆成多次 `tsp compile`。

### `unserializable-example`

> This @example could not be serialized to JSON and was omitted from the emitted schema.

`@example` 的值含有 compiler 無法序列化成純 JSON 的內容（不支援的 scalar constructor、格式錯誤的 `duration.fromISO(...)` 等）。該 example 被丟棄，schema 本身不受影響。

**修法：** 把 example 值簡化成 JSON 可表示的內容。

### `unserializable-message-example`

> This @messageExample could not be serialized to JSON and was dropped from the emitted message.

`@messageExample` 的值含有 compiler 無法序列化為純 JSON 的內容（不支援的 scalar 建構式、格式錯誤的 `duration.fromISO(...)` 值等）。該筆整筆捨棄，連同其中本來可以序列化的欄位。只保留一半 payload 的範例會描述出應用程式從不發送的 message。

**修法：** 把範例值改寫成可用 JSON 表示的部分。

### `unrepresentable-numeric-constraint`

> This @\<decorator\> constraint could not be represented as a JSON number (its value overflows or loses precision as a JS number) and was omitted from the emitted schema.

`@minValue` / `@maxValue` / `@minLength` 等的邊界值以 JavaScript number 表示時溢位或掉精度，例如 `int64` 上的 `@maxValue(9223372036854775807)`。該關鍵字被省略，不會輸出壞掉的值。

**修法：** 改用 double 可精確表示的邊界值（±2^53 以內），或移除該限制。

### `unsupported-temporal-range-constraint`

> This @\<decorator\> constraint targets a date/time/duration value, which draft-07 JSON Schema cannot express as a `minimum`/`maximum`, and was omitted from the emitted schema.

`@minValue` / `@maxValue` 標在時間類 scalar（`utcDateTime`、`plainDate`、`duration` 等）上。這些 scalar 輸出為 `type: string`，draft-07 沒有能約束字串日期範圍的關鍵字。

**修法：** 移除該限制，或改以 `@doc` 用文字描述。

### `missing-discriminator-property`

> @discriminator("\<property\>") names a property that is not defined on this model. AsyncAPI requires the discriminating property to be defined here, so `discriminator` was omitted from the emitted schema.

**修法：** 在該 model（或祖先）上宣告這個屬性，或修正 `@discriminator` 裡的屬性名稱。指名用的是 **TypeSpec** 屬性名稱，不是 `@encodedName` 的 wire name。

### `optional-discriminator-property`

> @discriminator("\<property\>") names a property that is optional on this model. AsyncAPI requires the discriminating property to be required, so `discriminator` was omitted from the emitted schema.

**修法：** 把 discriminating 屬性改成必填（移除 `?`）。

### `encoded-name-override-conflict`

覆寫屬性的 `@encodedName` 與祖先同名屬性的 wire name 不同。一般的 `allOf: [$ref Base, own]` 形狀會同時要求**兩個** wire name，導致任何合法 payload 都被拒絕。emitter 改為攤平該 model 的 schema（繼承屬性內聯，不再 `$ref` 基底）。

**修法：** 讓覆寫屬性用與祖先相同的 `@encodedName`，或只在其中一層改名。

### `never-typed-property-override`

屬性宣告為 `never` 以移除繼承屬性，但基底的 `$ref` 分支仍會要求它。emitter 同樣改為攤平 schema（`never` 屬性省略）。

**修法：** 若攤平可接受則不需處理，此警告只說明形狀改變。否則調整繼承結構，讓該屬性一開始就不被繼承。
