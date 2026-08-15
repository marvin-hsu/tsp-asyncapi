# 診斷訊息

本頁列出 emitter 會回報的所有警告與錯誤，附原因與修法。診斷代碼在 compiler 輸出中顯示為 `typespec-asyncapi/<code>`。

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
