---
outline: 2
---

# 診斷訊息

本頁列出 emitter 會回報的所有警告與錯誤，附原因與修法。診斷代碼在 compiler 輸出中顯示為 `tsp-asyncapi/<code>`。

## 錯誤

### `duplicate-schema-key`

> Duplicate schema name: '\<name\>'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.

兩個宣告解析到同一個 `components.schemas` key。常見原因：兩個 `@friendlyName` 解析成同一字串；或 model 名稱撞到 template instantiation 的推導名稱（例如已宣告 `model PageString`，又使用 `Page<string>`）。

**修法：** 改掉其中一個宣告的名稱，或給其中一個不同的 `@friendlyName`。emitter 絕不自動改名。

### `payload-schema-key-taken`

> Schema key '\<name\>' is claimed twice. Message '\<message\>' lifts @header fields into its `headers`, so its payload needs a schema of its own, and that schema is keyed after the message model. Rename the other type that claims '\<name\>', or describe the headers of '\<message\>' with @headers so its payload keeps every field.

會抽出 `@header` 欄位的 message 不能沿用 model 自己的 schema。那份 schema 仍然描述被抽出的欄位，而那些欄位已經歸入 `headers`。所以 payload 會另外取得一份 component，key 以 message model 為基底加上 `Payload` 後綴。現在有另一個宣告先佔走了那把 key。

payload 的形狀改為就地輸出。若改為引用 model 自己的 component，等於把被抽出的欄位描述成 payload 資料，message 會自相矛盾。

**修法：** 改名另一個型別；或改用 [`@headers`](./decorators/messages#headers) 描述 headers，讓 payload 保留所有欄位，就不需要額外的 schema。

### `raw-schema-key-taken`

> Schema key '\<name\>' is claimed twice. Message '\<message\>' carries a raw schema that another message carries too, so that schema is written once in `components.schemas` under a key derived from the message model. Rename the other type that claims '\<name\>', or give one of the two messages a different name.

兩個以上的 message 帶著相同的 [`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders)。那份 schema 只寫進 `components.schemas` 一次，key 以第一個帶著它的 message model 為基底，加上 `Payload` 或 `Headers` 後綴。現在有另一個宣告先佔走了那把 key。

raw schema 改為在每個 message 裡各寫一次。內容沒有遺失，只是文字重複。

**修法：** 改名另一個型別；或替兩個 message 其中之一改名，讓推導出的 key 改變。

### `unsupported-payload-type`

> This emitter does not support a \<kind\> here. Use a model, scalar, enum, union, or literal value instead.

屬性或 payload 位置指到 schema 層無法轉換的 TypeSpec 實體，例如 `Interface`、`Namespace`、`Operation`。compiler 本身不會拒絕這種寫法，只有 emitter 會。

**修法：** 改用 model、scalar、enum、union 或字面值型別。

### `unrepresentable-circular-reference`

> This anonymous type refers back to itself with no named type in between. A plain (non-$ref) schema cannot express that cycle. Give the type a name so it can be referenced through $ref instead.

匿名型別繞回自己，例如 `alias Foo = { a: Foo };`。匿名型別只能內嵌（沒有 `components.schemas` 項目），而內嵌 schema 無法表達循環。

**修法：** 把匿名型別改成具名 `model`。具名型別之間以 `$ref` 互相引用，循環沒有問題。

### `duplicate-message-key`

> Duplicate message name: '\<name\>'. Two @message models resolve to the same components.messages key. Pass an explicit name to @message on one of them.

兩個 `@message` model 解析到同一個 `components.messages` key。常見原因：不同 namespace 下的同名 model（message key 不帶 namespace 前綴，schema key 會帶）；或兩個 `@friendlyName` 解析成同一字串。

同一個 template 的兩個 instantiation 算出同一個 key 不會回報——原始碼裡只有一個 `@message`，兩者也指向同一份輸出的 component。

**修法：** 對其中一個的 `@message` 傳入明確名稱。

### `duplicate-message-decorator`

> @message is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @message.

`@message` 不可重複套用。疊加時只會保留其中一次，其餘名稱不會進到文件裡。

**修法：** 移除多餘的 `@message`。

### `duplicate-content-type-decorator`

> @contentType is applied to this model more than once. A message carries one content type, so only one application takes effect and the rest are discarded. Remove the extra @contentType.

`@contentType` 不可重複套用。一個 message 只有一個 `contentType` 欄位。疊加時只會保留其中一次，其餘的值會被靜默丟棄。

**修法：** 移除多餘的 `@contentType`。

### `empty-content-type`

> @contentType was given an empty media type. A blank media type names no format, so it cannot reach the emitted message. This @contentType was dropped, and the message falls back to the document defaultContentType. Give it a media type, such as 'application/json'.

[`@contentType`](./decorators/messages#contenttype) 收到空白的媒體型態。值會先去除前後空白，所以只有空白的值等同空字串。空白的媒體型態沒有指出任何格式，emitter 無法把它寫進 message。

這個 message 會退回文件層級的 `defaultContentType`。結果與沒有寫 `@contentType` 相同。使用者是刻意輸入空字串的，所以這個退回會回報，不會靜默發生。

**修法：** 給這個 decorator 一個媒體型態，例如 `application/json`，或是移除它。

### `duplicate-headers-decorator`

> @headers is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @headers.

`@headers` 不可重複套用。疊加時只會保留其中一次，其餘 headers model 不會進到文件裡。

**修法：** 移除多餘的 `@headers`。

### `duplicate-message-headers`

> This message takes its headers from more than one source. The three sources are a field marked @header, a model given to @headers, and a schema given to @rawHeaders. There is no rule that picks one over the others, so no `headers` were emitted at all. Keep one of the sources.

同一個 message 從一個以上的來源宣告 headers。三種來源是標了 `@header` 的欄位、傳給 `@headers` 的 model，以及傳給 `@rawHeaders` 的 schema。emitter 不定義三者的優先序，所以全部都不輸出。被標記的欄位留在 payload，錯誤修好之前不會有任何你寫的東西消失。

**修法：** 只留一個來源。把被標記的欄位搬進 `@headers` 的 model，或移除 `@headers` 或 `@rawHeaders`。

### `duplicate-raw-payload-decorator`

> @rawPayload is applied to this model more than once. A message carries one payload, so only one application takes effect and the rest are discarded. Remove the extra @rawPayload.

`@rawPayload` 不可重複套用。一個 message 只有一個 `payload` 欄位。疊加時只會保留其中一次，其餘 schema 會被靜默丟棄。

**修法：** 移除多餘的 `@rawPayload`。

### `duplicate-raw-headers-decorator`

> @rawHeaders is applied to this model more than once. A message carries one headers schema, so only one application takes effect and the rest are discarded. Remove the extra @rawHeaders.

`@rawHeaders` 不可重複套用，理由與 `@rawPayload` 相同。

**修法：** 移除多餘的 `@rawHeaders`。

### `empty-schema-format`

> This decorator was given an empty schemaFormat. A blank schemaFormat names no schema language, so it cannot reach the emitted message. This decorator was dropped, and the message falls back to the schema built from the model. Give it a format, such as 'application/vnd.apache.avro;version=1.9.0'.

[`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 收到空字串，或只有空白字元的字串。空白的 `schemaFormat` 沒有指出任何 schema 語言，emitter 無法把它寫進 message。

emitter 不會記錄任何東西。該 message 退回使用從 model 建出來的 schema，結果與沒有寫這個 decorator 相同。

**修法：** 給這個 decorator 一個格式，例如 `application/vnd.apache.avro;version=1.9.0`，或是移除它。

### `invalid-raw-schema`

> The schema given to this decorator cannot be represented as JSON, so it would write nothing into the document. This decorator was dropped, and the message falls back to the schema built from the model. Write the schema as a value the emitter can serialize, such as an object value or a string.

傳給 [`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 的 `schema` 引數，compiler 無法序列化成 JSON。常見原因是自訂 scalar 帶有自己的 `init` 建構式。

這個檢查不要求 object，與 [`invalid-binding-config`](#invalid-binding-config) 不同。AsyncAPI 把 `schema` 欄位定義為 `any`，所以字串與陣列都合法。

**修法：** 把 schema 寫成 emitter 可以序列化的值，例如 object value 或字串。

### `non-string-raw-schema`

> '\<format\>' is not a JSON based schema language, so AsyncAPI requires its schema to be inlined as a string. This schema was given as an object, and it is emitted as written. Write the schema as a string, such as the text of the .proto definition, or name a format that is JSON based.

[`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 的 `schemaFormat` 指的是非 JSON 基礎的 schema 語言，而 `schema` 引數不是字串。AsyncAPI 規定這種 schema 必須以字串內嵌。規格舉的例子是 Protobuf，表列格式中適用這條規則的就是兩個 Protobuf 識別字。

schema 仍照原樣輸出，與 [`unknown-schema-format`](#unknown-schema-format) 的處理一致。要改哪一邊由你決定。

**修法：** 把 schema 寫成字串，例如 `.proto` 定義的內容；或改用 JSON 基礎的格式。

### `string-raw-schema`

> '\<format\>' is a JSON based schema language, so AsyncAPI requires its schema to be inlined rather than given as text to be parsed. This schema is a string that opens a JSON object or array, and the official parser rejects a document that carries one. Write the schema as an object value. Note that a bare JSON string is still allowed, because a format such as Avro names its primitive types that way.

[`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 的 `schemaFormat` 指定了以 JSON 為基礎的 schema 語言，而 `schema` 參數是字串，且第一個非空白字元是物件或陣列的開頭。AsyncAPI 規定這種 schema 直接以值的形式內嵌，不是交出一段文字讓讀取端自行解析。

不是以物件或陣列開頭的字串不受影響。例如 Avro 就是用 `"long"` 這種單純字串命名它的原始型別。

這一條與 [`non-string-raw-schema`](#non-string-raw-schema) 互為鏡像，後者處理非 JSON 為基礎的格式卻收到物件的情況。

**修法：** 把 schema 寫成物件值，不要寫成加引號的字串。

### `raw-schema-local-ref`

> This schema refers to '\<ref\>', and it is written in '\<format\>'. AsyncAPI requires both ends of a $ref to carry the same schemaFormat. Every schema this emitter writes into the document is an AsyncAPI Schema Object, so the two ends disagree. The schema is emitted as written. Inline the definition instead of referring to it, or write this schema in the AsyncAPI Schema Object format.

傳給 [`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 的 schema，最外層帶有以 `#/` 開頭的 `$ref`，而它的 `schemaFormat` 不是 AsyncAPI Schema Object 格式。這種 reference 指向輸出的文件本身。emitter 寫進該文件的每一個 schema 都是 AsyncAPI Schema Object，所以被指向的一端與指向它的 schema 帶有不同的 `schemaFormat`。

emitter 只讀 raw schema 的最外層。巢狀在更深處的 reference 是用該 schema 語言自己寫的，emitter 不讀那個語言。

**修法：** 直接內嵌定義，不要用 reference；或把 schema 改寫成 AsyncAPI Schema Object 格式，例如 `application/vnd.aai.asyncapi+json;version=3.1.0`。

### `unresolved-raw-schema-ref`

> This schema refers to '\<ref\>', and the emitted document holds nothing there. A reference that starts with '#/' points into this document, and the emitter writes every location it can reach. A parser rejects the document as written. Note that a model reaches components.schemas only when some message uses it, and a @rawPayload model is not such a message. Point at a location the document holds, or inline the definition instead of referring to it.

傳給 [`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 的 schema，最外層帶有以 `#/` 開頭的 `$ref`，但完成的文件在那個位置沒有任何內容。emitter 照原樣複製 raw schema，所以這個 reference 是你寫的。以 `#/` 開頭的 reference 指向輸出的文件本身，該文件的每個位置都由 emitter 產生。所以 emitter 可以判定這一個不存在。

常見原因是指向 raw model 自己，例如在 model `OrderCreated` 上寫 `#/components/schemas/OrderCreated`。帶 `@rawPayload` 的 model 不會佔用自己的 `components.schemas` key。只有在另一個 message 也引用到同一個 model 時，那個位置才存在。

這個檢查在文件完成後才執行，此時每個區塊都已就位。emitter 只讀 raw schema 的最外層，深度與 [`raw-schema-local-ref`](#raw-schema-local-ref) 相同。同時違反兩條規則的 reference 會回報兩次，因為兩條規則各自獨立。

**修法：** 改指向文件實際存在的位置，或直接內嵌定義，不要用 reference。

### `raw-payload-lifted-header`

> The message model '\<name\>' carries @rawPayload and also lifts @header fields into its `headers`. The emitter emits the raw payload exactly as written, so it cannot remove the lifted fields from a schema it does not read. The raw payload and the headers are both emitted, and they can describe the same field twice. Describe the headers of '\<name\>' with @headers or @rawHeaders, or drop the @header marks and let the raw schema carry those fields.

同一個 message 同時有 `@rawPayload` 與至少一個標了 `@header` 的欄位。有欄位抽出的 message 平常會取得自己的一份 payload schema，那份 schema 不含被抽出的欄位。raw payload 是不透明的，emitter 無法從中拿掉任何東西。Avro 或 Protobuf 的 record 仍可能宣告 message 已經當成 header 的那個欄位。

兩邊都照樣輸出。raw payload 原樣進到 message，被抽出的欄位仍然成為 `headers`。錯誤修好之前不會有任何你寫的東西消失。這一點與 [`duplicate-message-headers`](#duplicate-message-headers) 不同，後者兩個來源都不輸出。在那裡，兩個來源填的是同一個欄位。在這裡，兩者填的是兩個不同欄位。

被抽出的欄位若來自這個 model 繼承的 base message，同樣會回報。

**修法：** 改用 `@headers` 或 `@rawHeaders` 描述 headers，或移除 `@header` 標記，讓 raw schema 承載那些欄位。

### `headers-not-object`

> The model '\<name\>' given to @headers is backed by an array. AsyncAPI requires the headers schema to be a key/value map, so no `headers` were emitted. Pass a model with properties instead.

傳給 `@headers` 的 model 會輸出 `type: "array"`。它以 array 為底（`is` 一個 array，或繼承自 array）。AsyncAPI 規定 `headers` schema 描述一組 key/value map。

**修法：** 改傳一個有屬性的 model，或以 `Record<T>` 為底的 model。兩者都輸出 object schema。

### `discriminated-lifted-header`

> The message model '\<name\>' lifts @header fields into its `headers` and also carries @discriminator. The discriminator names the subtype schemas, and those describe the lifted fields as payload data, so no payload could satisfy the message. The emitter leaves the discriminator off the payload schema. Describe the headers of '\<name\>' with @headers instead, so its payload keeps every field.

message model 同時帶了 [`@discriminator`](./decorators/schemas#discriminator) 並抽出 `@header` 欄位。discriminator 會把讀取端導向各個子型別的 schema，而每個子型別仍然把被抽出的欄位描述成 payload 資料。這個 message 的任何 payload 都無法滿足它們。

該關鍵字不會寫進 payload schema。多型仍然透過 model 自己的 component 呈現，那份 component 描述所有欄位。

**修法：** 改用 [`@headers`](./decorators/messages#headers) 描述 headers，讓 payload 保留所有欄位。

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

某次 [`@asyncTag`](./decorators/document-info#asynctag) 套用給了空白的 tag 名稱。值會先去除前後空白，所以只有空白的名稱等同空字串。AsyncAPI Tag Object 的 `name` 是必填欄位，空白的名稱沒有任何 consumer 比對得到。

**修法：** 為該 tag 補上名稱。

### `conflicting-tag-metadata`

> Tag '\<name\>' is declared more than once here, with a different '\<field\>'. AsyncAPI emits one Tag Object per name on an object, so only one of the two values can be kept. The first one in source order was kept. Merge the @asyncTag applications into one, or give them different names.

同一個 target 上兩次套用 [`@asyncTag`](./decorators/document-info#asynctag) 指到同一個 tag 名稱，而且同一個欄位給了兩個不同的值。AsyncAPI 在一個物件上，同一個名字只輸出一個 Tag Object，兩個值必定有一個要被丟掉。emitter 回報這個歧義，不自行挑選。

若兩次套用設定的是*不同*欄位，則會合併；內建 `@tag` 與同名的 `@asyncTag` 也會合併。同一個名字出現在兩個*不同*的 target 上永遠不算衝突：AsyncAPI 讓每個物件各自持有獨立的 `tags` 陣列。

**修法：** 把兩次套用合併成一次，或改用不同的名字。

### `invalid-extension-key`

> The extension key '\<key\>' is not a specification extension name. AsyncAPI reads only a key of the shape 'x-' followed by one or more letters, digits, underscores, dots, or hyphens, so this @extension was dropped. Rename the key to that shape.

傳給 [`@extension`](./decorators/document-info#extension) 的 key 不符合 AsyncAPI 規格擴充的樣式。樣式是 `^x-[\w\d\.\-\_]+$`。其他 key 在輸出的物件裡都是來歷不明的欄位，官方 parser 會判定整份文件不合法。

只有 `x-` 就是這種 key。它有前綴，但後面沒有名字。含空白的 key 也是。

**修法：** 把 key 改成 `x-` 加上一個以上的英文字母、數字、底線、點或連字號。

### `duplicate-extension-key`

> The extension key '\<key\>' is applied to this target more than once. An object carries one value per key, so this @extension was dropped and the first one with this key in source order was kept. Remove the extra @extension, or give it another key.

同一個 target 上兩次 [`@extension`](./decorators/document-info#extension) 用了同一個 key。輸出的物件對一個 key 只放一個值，兩個值必定有一個要被丟掉。保留原始碼順序中的第一次套用。

同一個 key 出現在兩個*不同*的 target 上永遠不算衝突。每個輸出的物件各自持有自己那組擴充欄位。

**修法：** 移除多餘的那次套用，或改用另一個 key。

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

### `empty-channel-address`

> @channel was given a blank address. A blank address names no topic, path, or routing key, so it cannot reach the emitted document. This channel was dropped. Give it an address, such as 'orders.created', or use @dynamicChannel when the address is only known at runtime.

address 是空字串，或只有空白字元。這個 channel 被丟棄。

**修法：** 給這個 channel 一個 address。位址只有在執行期才決定時，改用 `@dynamicChannel`。

### `invalid-channel-address`

> The channel address '\<address\>' carries a query string. AsyncAPI states that a channel address must not use query parameters, and that a channel binding describes them instead. This channel was dropped. Move everything after the '?' into a channel binding.

三種問題會回報這個代碼：address 含 query string、address 含 fragment、`{}` 不成對或巢狀。訊息會指出是哪一種。三種情況都會丟棄整個 channel。

scheme 與 host 不檢查。`wss://example.com/socket` 這樣的完整 URL 是合法的 address。

**修法：** 把 query string 或 fragment 移到 channel binding。讓大括號成對，且不要巢狀。

### `invalid-channel-param-name`

> '\<name\>' is not a legal channel address parameter name. Only the characters a-z, A-Z, 0-9, '-', and '_' are allowed, because the name is also the key of that parameter in the emitted `parameters` map and the name of the TypeSpec property that declares it. This channel was dropped.

address 裡的某個 `{name}` 超出字元集。這個名稱同時也是宣告該參數的 TypeSpec 屬性名稱，所以超出字元集的名稱永遠不可能被宣告。

**修法：** 把模板名稱改成只含英文字母、數字、`-`、`_`。

### `empty-channel-id`

> The channel id given to this decorator is blank. The id is the key of this channel in the emitted `channels` map, and a blank key names nothing. This channel was dropped. Give it an id, or leave the argument out so the address, or the interface or namespace name for a dynamic channel, is used.

明確指定的 channel id 引數是空字串，或只有空白字元。

**修法：** 給一個 id，或直接省略該引數。省略時 key 用 address。dynamic channel 沒有 address，key 用 interface 或 namespace 的宣告名稱。

### `duplicate-channel-decorator`

> @channel is applied to this interface or namespace more than once. A channel carries one address, so only one application takes effect and the rest are discarded. Remove the extra @channel.

`@channel` 不可重複套用。一個 channel 只有一個 address，疊加會靜默丟掉其餘的 address。

**修法：** 移除多餘的 `@channel`。第二個 channel 請宣告在第二個 interface 或 namespace 上。

### `duplicate-dynamic-channel-decorator`

> @dynamicChannel is applied to this interface or namespace more than once. Only one application takes effect, and the rest are discarded. Remove the extra @dynamicChannel.

`@dynamicChannel` 不可重複套用，理由與 `@channel` 相同。

**修法：** 移除多餘的 `@dynamicChannel`。

### `conflicting-channel-decorators`

> @channel and @dynamicChannel are both applied to this interface or namespace. One states an address and the other states that the address is unknown, and no rule picks a winner, so no channel was emitted at all. Keep one of the two.

兩個 channel decorator 同時標在一個 target 上。一個給了 address，另一個說 address 未知。沒有規則可以判定誰勝出，所以這個 target 完全不輸出 channel。

**修法：** 兩個 decorator 只保留一個。

### `duplicate-channel-id`

> Duplicate channel id: '\<id\>'. Each channel needs its own id, because the id is the key of that channel in the emitted document. This channel was dropped, and the first one with this id in source order was kept. Pass an explicit id to @channel on one of them.

兩個 channel 對應到同一個 `channels` map 的 key。常見成因：兩個 channel 共用同一個 address，因為 address 是預設的 key；不同 namespace 下兩個同名的 dynamic channel，因為 channel key 會去掉 namespace 前綴；或兩個明確指定的 id 是同一個字串。

**修法：** 對其中一個的 `@channel` 或 `@dynamicChannel` 傳入明確的 id。

### `missing-channel-param`

> The channel address uses '{\<name\>}', but no operation in this channel declares a parameter with that name. AsyncAPI requires the `parameters` map to cover every expression in the address. Add a '\<name\>' parameter to an operation of this channel, or take the expression out of the address.

address 含一個模板，但這個 channel 的 operation 都沒有宣告它。輸出的 `parameters` map 仍會涵蓋整個 address，該名稱對應一個空的 Parameter Object。

**修法：** 在這個 channel 的 operation 加上該參數，或把模板從 address 移除。

### `unused-channel-param`

> The parameter '\<name\>' is not used by the address of channel '\<id\>'. An operation parameter whose type is not a @message model describes a channel address parameter, and this emitter never rewrites the address to absorb one. Add '{\<name\>}' to the address, or mark the parameter type with @message.

這個 channel 的 operation 宣告了 address 沒有用到的參數。型別不帶 `@message` 的頂層 operation 參數一律視為 channel address 參數，所以這個參數無處可去。

**修法：** 把模板加進 address，或在該參數的型別上標 `@message`，讓它改算成 message。

### `non-string-channel-param`

> The channel parameter '\<name\>' is not declared as a string. The AsyncAPI Parameter Object has no `schema` field, so a channel parameter carries no type and its value is always a string. Declare it as a string, a string literal, a union of string literals, or a string-backed enum.

宣告的型別不是字串型別。AsyncAPI Parameter Object 只有 `enum`、`default`、`description`、`examples`、`location` 五個欄位，沒有 `schema`。型別因此無處可放。

**修法：** 把參數宣告成 string、字串字面值、字串字面值的 union，或字串 enum。

### `optional-channel-param`

> The channel parameter '\<name\>' is optional. A Channel Address Expression is a bare '{name}' with no operator, so a separator next to it cannot disappear along with the value, whatever the position in the address. Make the parameter required, and give the Parameter Object a `default` through a TypeSpec default value if it usually carries one value.

宣告是選填的。不論模板在 address 的哪個位置，這都是錯誤。Channel Address Expression 只允許裸的 `{name}`，沒有 RFC 6570 的 operator，所以分隔字元無法跟著缺席的值一起消失。

**修法：** 把參數改成必填。若它經常是同一個值，給它 TypeSpec 預設值。該值會成為 Parameter Object 的 `default`。

### `conflicting-channel-param`

> The channel parameter '\<name\>' is declared more than once in channel '\<id\>', with a different '\<field\>'. AsyncAPI emits one Parameter Object per name on a channel, so only one of the two values can be kept. The first one in source order was kept. Give the two declarations the same type, default, documentation, examples, and location.

同一個 channel 的兩個 operation 宣告同一個參數名稱，但兩處的型別、預設值、`@doc`、`@example` 或 `@parameterLocation` 不同。一個 channel 對一個名稱只輸出一個 Parameter Object，兩個值只能留一個。保留原始碼順序在前的那一個，讓文件其餘部分仍可閱讀。

型別的比較依據是它允許的值，不是它的寫法。兩個 operation 各自寫一次 `"eu" | "us"`，兩者視為一致。

**修法：** 讓兩處宣告的型別、預設值、說明、範例與 location 一致。

### `duplicate-parameter-location-decorator`

> @parameterLocation is applied to this property more than once. A channel parameter carries one location, so only one application takes effect and the rest are discarded. Remove the extra @parameterLocation.

`@parameterLocation` 不可重複套用。一個 Parameter Object 只有一個 `location` 欄位。

**修法：** 移除多餘的 `@parameterLocation`。

### `invalid-parameter-location`

> '\<location\>' is not a legal channel parameter location, so no `location` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.payload#/user/id'.

runtime expression 超出文法。開頭必須是 `$message.header#` 或 `$message.payload#`，後面可以接 JSON Pointer。`#` 是必要的，因為規格的規範性 JSON Schema 要求它。

**修法：** 照該格式撰寫，例如 `$message.payload#/user/id`。

### `duplicate-send-decorator`

> @send is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @send.

`@send` 不可重複套用。一個 Operation Object 只有一個 `action` 欄位。

**修法：** 移除多餘的 `@send`。

### `duplicate-receive-decorator`

> @receive is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @receive.

`@receive` 不可重複套用，理由與 `@send` 相同。

**修法：** 移除多餘的 `@receive`。

### `conflicting-operation-actions`

> @send and @receive are both applied to this operation. One states that this application sends the message and the other states that it receives one, and no rule picks a winner, so no operation was emitted at all. Keep one of the two.

兩個 decorator 宣告相反的方向。沒有規則可以判定誰勝出，所以這個 operation 直接被丟棄，不會輸出任意一個 action。

**修法：** 只保留其中一個。同一個 channel 上的兩個方向是兩個 operation，另一個方向請另外寫一個 operation。

### `empty-operation-id`

> The operation id given to this decorator is blank. The id is the key of this operation in the emitted `operations` map, and a blank key names nothing. This operation was dropped. Give it an id, or leave the argument out so the operation name is used.

id 是這個 operation 在輸出文件中的 key。空白的 key 沒有指到任何東西。

**修法：** 給引數一個 id，或整個省略引數，改用 operation 名稱。

### `duplicate-operation-id`

> Duplicate operation id: '\<id\>'. Each operation needs its own id, because the id is the key of that operation in the emitted document. This operation was dropped, and the first one with this id in source order was kept. Pass an explicit id to @send or @receive on one of them.

兩個 operation 對應到同一個 key。key 來自明確的 id 引數，沒給時來自 operation 名稱。原始碼順序在前的保留該 key。

**修法：** 在其中一個的 `@send` 或 `@receive` 上傳入明確的 id。

### `duplicate-reply-channel-decorator`

> @replyChannel is applied to this operation more than once. A reply points at one channel, so only one application takes effect and the rest are discarded. Remove the extra @replyChannel.

`@replyChannel` 不可重複套用。一個 Operation Reply Object 只有一個 `channel` 欄位。

**修法：** 移除多餘的 `@replyChannel`。

### `duplicate-reply-address-decorator`

> @replyAddress is applied to this operation more than once. A reply carries one address, so only one application takes effect and the rest are discarded. Remove the extra @replyAddress.

`@replyAddress` 不可重複套用。一個 Operation Reply Object 只有一個 `address` 欄位。

**修法：** 移除多餘的 `@replyAddress`。

### `invalid-reply-address-location`

> '\<location\>' is not a legal reply address location, so no `address` was emitted on the reply. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/replyTo'.

runtime expression 超出文法。開頭必須是 `$message.header#` 或 `$message.payload#`，後面可以接 JSON Pointer。這與 `@correlationId` 和 `@parameterLocation` 的文法相同。

**修法：** 照該格式撰寫，例如 `$message.header#/replyTo`。

以下五個代碼來自通訊協定 binding，另有兩個列在「警告」章節。回報它們的 decorator 見[通訊協定 binding](/zh-tw/reference/bindings/)。

### `duplicate-binding`

> The protocol '\<protocol\>' already has a binding at the \<level\> level on this target. A Bindings Object carries one member per protocol, and two configurations are neither merged nor allowed to overwrite each other. This binding was dropped, and the first one in source order was kept. Keep one of the two, and note that @binding("\<protocol\>", ...) claims the same member as the decorator named after that protocol.

同一個 target 的同一層級上，一個通訊協定被宣告兩次。`@binding("kafka", ...)` 與 `@kafkaChannel` 並存也是同一個錯誤，因為兩者都寫 `kafka` 成員。

**修法：** 兩個 decorator 只留一個。

### `empty-binding-protocol`

> The protocol name given to @binding is blank. The name becomes a member name of the emitted `bindings` object, and a blank member name is not legal. This binding was dropped. Name the protocol, such as `kafka` or `mqtt`.

通訊協定名稱會成為輸出文件中的 key。空白的 key 沒有指到任何東西。

**修法：** 填入通訊協定名稱。

### `invalid-binding-config`

> The config given to @binding("\<protocol\>", ...) is not an object. Every member of a Bindings Object is an object, so this binding was dropped. Write the config as an object value, such as #{ qos: 2 }.

AsyncAPI 規定 Bindings Object 的每個成員都是物件。字串、數字與陣列都會被拒絕。

**修法：** 把設定寫成物件值。

### `invalid-required-binding-field`

> The \<protocol\> binding field '\<field\>' expects \<expected\>. The value given here is outside that. The binding cannot be written without the field, so the whole binding was dropped. Write '\<field\>' as \<expected\>.

某個欄位的值違反 binding 規格。少了這個欄位，emitter 就寫不出這個 binding，所以丟掉的是整個 binding，不是單一欄位。這一點與 [`invalid-binding-field`](#invalid-binding-field) 不同，那個代碼是警告，而且會保留 binding 的其餘部分。

會回報它的欄位有：Amazon SQS channel 的 `queue` 與 `deadLetterQueue`、SQS operation 的 `queues`、Google Cloud Pub/Sub channel 的 `schemaSettings`，以及 Pulsar channel 的 `persistence`。`deadLetterQueue` 雖然是選填，代價一樣是整個 binding。作者既然寫了這個佇列，少了它的 binding 就比原始碼描述得更少。

**修法：** 依訊息指出的範圍填值。

### `missing-binding-field`

> The \<protocol\> binding requires the field '\<field\>', and this binding does not give it. AsyncAPI would reject the emitted document, so the whole binding was dropped. Add '\<field\>' to the decorator config.

有幾個 binding 規定了作者必須給的欄位。Pulsar channel 需要 `namespace` 與 `persistence`。Google Cloud Pub/Sub channel 需要 `schemaSettings`，而該物件又需要 `encoding` 與 `name`。Amazon SQS channel 需要 `queue`，而該 queue 又需要 `name` 與 `fifoQueue`。SQS operation 需要至少有一筆的 `queues` 清單。JMS server 需要 `jmsConnectionFactory`。

空白字串等同於沒寫。全是空格的名稱沒有指名任何東西，價值不高於完全不寫該欄位。

同一個物件缺的每個欄位都會回報，不是只報第一個。一次只報一個會讓作者多跑一輪。

**修法：** 依訊息指名的欄位，補進 decorator 的設定裡。

### `duplicate-security-scheme-name`

> Duplicate security scheme name: '\<name\>'. Each @securityScheme needs its own name, because the name is the key of that scheme in components.securitySchemes. This @securityScheme was dropped, and the first one with this name in source order was kept.

兩個 `@securityScheme` 用了同一個名稱。名稱就是 `components.securitySchemes` map 的 key，兩者會相撞。scheme 是跨整個程式收集的，因此標在不同 namespace 上也算重名。

**修法：** 其中一個改名。

### `invalid-security-scheme-name`

> Invalid security scheme name: '\<name\>'. AsyncAPI only allows letters, digits, '.', '-', and '_' in a components key. This decorator was dropped.

名稱超出 AsyncAPI 允許的 Components Object key 字元集。此處允許點號，根層 `servers` map 的 key 則不允許。

有兩個 decorator 會回報這條診斷。`@securityScheme` 把名稱寫成 `components.securitySchemes` 的 key。`@useSecurity` 把名稱寫進指向該 key 的 JSON Pointer，字元集以外的字元會讓 pointer 格式錯誤。

**修法：** 改用只含英文字母、數字、`.`、`-`、`_` 的名稱。emitter 絕不自動改名。

### `empty-security-scheme-field`

> Empty security scheme field: '\<field\>'. AsyncAPI requires a value for this field on this kind of scheme. This @securityScheme was dropped.

scheme 的必填字串欄位是空字串，或只有空白字元。涵蓋 `httpApiKey` 的 `name`、`http` 的 `scheme`、`openIdConnect` 的 `openIdConnectUrl`。空白值可以通過型別檢查，卻讓文件不合規格。

**修法：** 給該欄位一個值。

### `missing-oauth-flow-url`

> The '\<flow\>' OAuth flow needs a '\<field\>'. A blank value counts as a missing one, because no client can call it. This @securityScheme was dropped.

OAuth flow 缺少該 flow 必填的 URL。`implicit` 與 `authorizationCode` 需要 `authorizationUrl`。`password`、`clientCredentials`、`authorizationCode` 需要 `tokenUrl`。

**修法：** 補上該 flow 需要的 URL。

### `empty-oauth-flows`

> This oauth2 scheme declares no flow. A client then has no way to obtain a token. This @securityScheme was dropped. Declare at least one of `implicit`, `password`, `clientCredentials`, and `authorizationCode`.

`oauth2` scheme 的 `flows` 是空物件。

**修法：** 至少宣告一個 flow。

### `invalid-url`

> The '\<field\>' value '\<url\>' is not an absolute URL. AsyncAPI requires an absolute URL here, and a parser rejects the whole document over a relative one. This decorator was dropped. Write a URL with a scheme, such as 'https://example.com/token'.

URL 欄位的值不是絕對 URL。相對路徑（例如 `/token`）不合格，純文字也不合格。AsyncAPI 對這些欄位標了 `uri` 格式。值不合格時，parser 會拒絕整份文件。

三個 decorator 會回報這個診斷。`@securityScheme` 檢查 `openIdConnectUrl`，也檢查每個 OAuth flow 的 `authorizationUrl`、`tokenUrl` 與 `refreshUrl`。flow 的 URL 會連 flow 名稱一起標示，例如 `implicit.authorizationUrl`。`@externalDocs` 檢查它帶的連結，該連結會寫進 `info` 與每一個 server。`@info` 檢查 `termsOfService`、`contact.url` 與 `license.url`。

`@info` 只丟掉該欄位，decorator 的其餘部分保留。另外兩個會丟掉整個 decorator。訊息本身會說明是哪一種。

**修法：** 把 URL 寫成含 scheme 的形式，例如 `https://example.com/token`。

### `empty-info-version`

> @info was given a blank version. The `version` of an AsyncAPI Info Object is required, and a blank one names no version of the application. The version falls back to the document default. Give it a version, such as '1.0.0'.

`@info` 拿到的 `version` 是空白。值會先去除前後空白，所以只有空白的值等同空字串。AsyncAPI 規定這個欄位必填，所以版本後備為 `0.0.0`。

**修法：** 給 `@info` 一個版本，例如 `1.0.0`。

### `empty-license-name`

> @info was given a license with a blank name. The `name` of an AsyncAPI License Object is required, and a blank one names no license. The whole license was dropped, and the rest of the decorator was kept. Give the license a name, such as 'MIT'.

`@info` 拿到的 `license` 帶了空白的 `name`。值會先去除前後空白，所以只有空白的值等同空字串。AsyncAPI 規定這個欄位必填，沒有名稱的 License Object 指不到任何授權條款。

整個 license 會被丟掉，`license.url` 也一起丟掉。`@info` 的其餘部分保留。

**修法：** 給授權條款一個名稱，例如 `MIT`。

### `duplicate-info-decorator`

> @info is applied to this namespace more than once. A document carries one Info Object, so only one application takes effect and the rest are discarded. Remove the extra @info.

同一個 namespace 套用了多次 `@info`。一份文件只有一個 Info Object，所以只有一次套用會生效。同一個宣告上的 decorator 由下往上執行，所以寫在最後的那次先執行並勝出。

**修法：** 把多次套用合併成一次，移除多餘的 `@info`。

### `conflicting-generated-schema-source`

> Two preview features generate the payload schema of this model: '\<first\>' and '\<second\>'. There is no order between them, so the emitter cannot choose one. Turn one of the two off in `preview-features` in `tspconfig.yaml`.

有兩個[預覽功能](./emitter-options#預覽功能)為同一個 model 產生 payload schema。

emitter 兩個都不採用。要選出勝者，只能看 emitter 列出 provider 的順序，而那個順序不是專案講出來的。

這時不會輸出文件。兩份 artifact 都丟掉，model 退回 TypeSpec 型別產生的 schema。那份輸出等於答非所問。

**修法：** 從 `tspconfig.yaml` 的 `preview-features` 移除其中一個名稱。

### `preview-feature-unavailable`

> The preview feature '\<feature\>' is not available in this release. It is a name this emitter reserves, and the provider behind it is not built yet. Remove '\<feature\>' from `preview-features` in `tspconfig.yaml`.

[`preview-features`](./emitter-options#預覽功能) 選項指名了一個本版沒有實作的功能。保留的名稱是 `protobuf` 與 `avro`。這兩個在本版都已經實作，所以目前沒有名稱會回報這條診斷。不在保留集合裡的名稱會先被選項 schema 擋下，不會走到這條診斷。

不會寫出任何檔案。在這個錯誤旁邊輸出一份文件，等於忽略了請求卻不說明。

**修法：** 從 `tspconfig.yaml` 的 `preview-features` 移除該名稱。

### `protobuf-artifact-unavailable`

> Model '\<name\>' carries @Protobuf.message, and no namespace above it carries @Protobuf.package. A generated payload is the proto3 text of a whole package, so the model needs one. Add @Protobuf.package to the namespace that holds this model.

> Model '\<name\>' of package '\<package\>' reaches \<construct\>, and proto3 has nothing this emitter can write it as. So this message has no generated payload. Describe that part with a construct proto3 covers, or remove @Protobuf.message from the model.

> Scalar '\<scalar\>' has no proto3 type, and no scalar it extends has one either. So model '\<name\>' of package '\<package\>' has no generated payload. Give the field a scalar that extends one of the Protobuf scalar types.

三種問題會回報這個代碼，訊息會指出是哪一種：model 上層沒有 package、model 走到寫不成 proto3 的構造、欄位用了對映不到 proto3 型別的 scalar。

第二種訊息會指出它停在哪個構造。這個 emitter 寫的是單一 payload 的 proto3 文字，那份文字不含 `import` 行。在那裡沒有誠實形式的構造一律拒絕：

- union，以及其他 proto3 沒有對應形式的屬性型別
- 匿名 model
- template 執行個體
- 帶 `@Protobuf.externRef` 的型別，包含 well known 型別
- 沒有 `@Protobuf.field` 編號的屬性
- `Protobuf.Map` 的陣列，proto3 沒有這種形式
- 巢狀在其他型別裡的 `Protobuf.Map`，例如另一個 map 的值
- 用 proto3 不能當 map key 的型別當 key 的 `Protobuf.Map`
- 值是陣列的 `Protobuf.Map`，因為 map 的值不帶 label
- 沒有 key 和 value 的 `Protobuf.Map`
- 傳進值而不是型別的 `Protobuf.Map`
- 屬於其他 Protobuf package 的 model 或 enum
- 沒有任何 `@Protobuf.package` 涵蓋的 model 或 enum
- 名稱已被同一份 payload 的另一個宣告佔用的 model 或 enum
- 第一個變體不是零的 enum
- 有非整數變體的 enum
- 這個 emitter 讀不懂的 `@Protobuf.package` 宣告
- 這個 emitter 讀不懂的 `@Protobuf.reserve` 列表

其中四項指的是這個 emitter 讀不懂的 state：沒有 key 和 value 的 `Protobuf.Map`、傳進值而不是型別的 `Protobuf.Map`、`@Protobuf.package` 宣告，以及 `@Protobuf.reserve` 列表。那些 state 屬於另一個 library，那個 library 對它的形狀沒有任何承諾。遇到讀不懂的形狀就拒絕，不猜：猜錯會把錯的 proto3 文字寫進文件，而且不會有任何地方講出來。

第三種訊息會指出是哪個 scalar。這個 emitter 對映 Protobuf library 對映的那 15 個 scalar。其中九個是 TypeSpec 內建的 scalar，六個來自 Protobuf library。它也會沿著自訂 scalar 的 extends 鏈往上找。整條鏈都碰不到那 15 個的 scalar，沒有型別可寫。

只帶 `@Protobuf.message`、沒有 `@AsyncAPI.message` 的 model 不會收到任何診斷。它沒有要求 payload，所以拿官方 decorator 描述其他型別的專案不會因此建置失敗。

`protobuf` 預覽功能在收集產生的 payload 時回報這條診斷。被指名的 model 拿不到產生的 payload。emitter 回報問題，不寫出空的 payload，因為空 payload 讀起來像一份什麼都沒描述的 schema。

model 屬於哪個 package，由上層最近一個帶 `@Protobuf.package` 的 namespace 決定。這個 emitter 讀 decorator state，所以改名過的 package 以它宣告的名稱比對。

**修法：** 在 model 所在的 namespace 加上 `@Protobuf.package`。另外兩種訊息則改寫訊息指名的型別，或從該 model 移除 `@Protobuf.message`。

### `header-on-generated-payload`

> Property '\<name\>' of message '\<message\>' carries @header, and the model carries \<decorator\>. A header travels beside the payload, and neither Protobuf nor Avro has a way to describe a property the payload does not carry. Move the headers into their own model and point at it with @headers.

一個 message model 在自己的欄位上寫了 `@header`，同時又帶著 `@Protobuf.message` 或 `@Avro.avroRecord`。

`@header` 說明那個屬性走在 payload 旁邊。兩種目標語言都沒有這個概念。Protobuf 給 message 的每個屬性一個欄位編號，Avro 給 record 的每個屬性一個 field，所以一個 payload 不帶的屬性既沒有位置可放，也沒有辦法標記成不存在。

另一個選項是把屬性從產生的 schema 裡省略，那更糟。`@typespec/protobuf` 與 Avro emitter 都寫出完整的 model，兩者都不讀 AsyncAPI decorator。這樣文件裡的 schema 與獨立的檔案會描述同一個 message 的不同形狀，而兩個檔案都不會說出這件事。

每個被標記的屬性都會被指名。修好一個再編譯一次找下一個，這個來回可以省下來。

這是在任何 emitter 執行之前回報的。所以它對「輸出文件」、「只輸出 schema 檔案」、「什麼都不輸出」三種專案一律成立。不會寫出任何檔案。

標在 message 碰到的其他 model 上是另一回事。那個 model 不是 message，標記在那裡沒有意義，改由 [`nested-header-ignored`](#nested-header-ignored) 回報。

**修法：** 把 headers 移進自己的 model，用 `@headers` 指向它。這樣 message model 只裝 payload，而每個檔案的寫出者對「哪些欄位屬於哪裡」的看法一致。

### `avro-artifact-unavailable`

> Model '\<name\>' carries @Avro.avroRecord, and the Avro walk refused it: \<reason\> So this message has no generated payload. Describe that part with a construct Avro covers, or remove @Avro.avroRecord from the model. Emitting the Avro files themselves reports every reason rather than the first.

某個 model 同時有 `@Avro.avroRecord` 與 `@AsyncAPI.message`，而 `tsp-avro` 拒絕替它建出 schema。訊息裡引述的原因來自那個套件。

只引述第一條原因。Avro 的走訪遇到拒絕之後會繼續走，所以一個 model 可能累積多條。要讀到全部，把 `tsp-avro` 放進 `emit` 再編譯一次。

不會寫出文件。那個 model 的 payload 會退回成它的 TypeSpec 型別產生的 schema。那份檔案用一般的 JSON Schema 回應了一個要求 Avro 的請求，而且檔案裡沒有任何一處說明這件事。

只有 `@Avro.avroRecord` 而沒有 `@AsyncAPI.message` 的 model 不會回報任何東西。它沒有要求任何 payload，所以替其他型別寫 Avro record 的專案不會因此變紅。

**修法：** 修改原因指出的那個部分，或是從 model 移除 `@Avro.avroRecord`。

### `avro-library-missing`

> The preview feature 'avro' is on, and 'tsp-avro' could not be loaded: \<reason\> That library holds the Avro walk, and this emitter carries no copy of it. Install 'tsp-avro' beside this emitter, or remove 'avro' from `preview-features` in `tspconfig.yaml`.

[`preview-features`](./emitter-options#預覽功能) 選項指名了 `avro`，而載入 `tsp-avro` 失敗。訊息會引述載入時回報的內容。

`tsp-avro` 是這個 emitter 的選用 peer dependency。只有功能開啟時才會載入它，所以沒開這個功能的專案完全不需要它。開啟這個功能的專案要自己安裝。

不會寫出文件。專案要求的每一份 Avro payload 都不在，而少了它們的文件描述的是另一件事。

**修法：** 安裝 `tsp-avro`，或是從 `tspconfig.yaml` 的 `preview-features` 移除 `avro`。

## 警告

### `duplicate-channel-address`

> Channel '\<id\>' and channel '\<other\>' both use the address '\<address\>'. AsyncAPI allows it, because the two have different ids, but a reader cannot tell which set of messages one address actually carries. Give them one channel with both operations, or give each its own address.

兩個 channel 用了同一個 address。文件仍然合法，因為兩者的 id 不同、各自列出自己的 message，所以這是警告而非錯誤。

代價是可讀性。**address 是執行期真實存在的東西，channel id 不是。** 所以讀文件的人無法判斷那一個 address 實際承載哪一組 message。

[`@dynamicChannel`](./decorators/channels#dynamicchannel) 不會被回報。它的 address 是 `null`，因為位址要到執行期才知道，所以兩個動態 channel 之間沒有互相說明任何事。

一對之中只回報後面那個，訊息裡會指出前面那個是誰。

**修法：** 把兩個 operation 放進同一個 channel；或讓每個 channel 有自己的 address。

### `channel-no-messages`

> Channel '\<id\>' has no recognizable messages. Did you forget to annotate the payload models with '@message'? The channel was emitted without a `messages` map.

這個 channel 的 operation 都沒有用到帶 `@message` 的 model。channel 仍會輸出，但不輸出 `messages` 欄位。該欄位在規格中是選填，文件仍合法，但沒有 message 的 channel 通常代表 payload model 漏標 `@message`。

**修法：** 在 payload model 上標 `@message`。同時確認這些 operation 直接寫在帶 channel 的 interface 或 namespace 裡。巢狀的 interface 是另一個範圍。

### `duplicate-use-server`

> @useServer names the server '\<name\>' more than once on this channel. AsyncAPI requires the entries of a channel's `servers` array to be unique, so one reference was emitted. Remove the extra @useServer.

同一個 channel 上有兩個 `@useServer` 指到同一個名稱。AsyncAPI 規定該陣列的項目唯一，所以 emitter 只輸出一個參照。

**修法：** 移除多餘的 `@useServer`。

### `invalid-use-server-name`

> Invalid server name: '\<name\>'. @useServer emits a reference to the key of that server in the root `servers` map, and AsyncAPI only allows letters, digits, '_', and '-' in such a key. A blank name is no key either. This @useServer was dropped.

`@useServer` 拿到的名稱用了 AsyncAPI 不允許出現在根層 `servers` map key 的字元。名稱按原樣檢查，與 `@server` 檢查它宣告的 key 的方式相同。空白不在允許的字元集內，所以前後帶空白的名稱兩邊都會被拒絕。emitter 不會改寫名稱，因為那會換掉作者指定的 server。

**修法：** 名稱只使用英文字母、數字、`_` 與 `-`。

### `undeclared-used-server`

> @useServer names the server '\<name\>', and no @server on the service namespace declares it. The emitted reference would point at nothing, and no parser could resolve it. This entry was dropped. Declare a @server with this name, or correct the name.

`@useServer` 指到的 server 名稱，在 service namespace 上沒有任何 `@server` 宣告。輸出的參照會指向文件裡不存在的 key。parser 會因為這種參照拒收整份文件，所以該筆項目被丟棄。

**修法：** 在 service namespace 上宣告同名的 `@server`，或改正名稱。

### `use-server-without-channel`

> @useServer names the server '\<name\>', but this interface or namespace carries neither @channel nor @dynamicChannel. Only a channel has a `servers` field, so this @useServer reaches no part of the document. Add @channel, or remove this @useServer.

`@useServer` 標在沒有 channel 的 target 上。只有 channel 才有 `servers` 欄位，所以這次套用到不了文件的任何位置。

**修法：** 為該 target 加上 `@channel` 或 `@dynamicChannel`，或移除這個 `@useServer`。

### `operation-without-channel`

> The operation '\<name\>' carries @send or @receive, and the interface or namespace around it carries no emitted channel. An operation always points at a channel, so this one reaches no part of the document. This operation was dropped. Add @channel or @dynamicChannel to the interface or namespace that holds it.

operation 一定要指向一個 channel。缺少 channel 可能是因為該 target 沒有 channel decorator。也可能是宣告的 channel 被丟棄，例如在 [`duplicate-channel-id`](#duplicate-channel-id) 衝突中落敗的那一個。

**修法：** 為包住這個 operation 的 interface 或 namespace 加上 `@channel` 或 `@dynamicChannel`。同時確認 operation 直接寫在它裡面，因為巢狀 interface 是另一個範圍。

### `reply-channel-not-a-channel`

> @replyChannel names '\<name\>', and that interface or namespace carries no emitted channel. A reply whose channel is unknown carries neither a checkable message list nor a checkable address, so the whole `reply` object was dropped. Add @channel or @dynamicChannel to '\<name\>'.

指定的目標沒有進到文件的 channel。被丟棄的是整個 `reply` 物件，不只是 channel 欄位。只輸出一半的 reply 會表達出作者沒有寫過的內容。

**修法：** 為指定的目標加上 `@channel` 或 `@dynamicChannel`。

### `reply-address-needs-dynamic-channel`

> @replyAddress is given, and the reply channel '\<id\>' carries an address. AsyncAPI requires the address of that channel to be null when a reply address is given. The `address` was dropped from the reply, and the rest of the reply was kept. Declare '\<id\>' with @dynamicChannel instead of @channel.

回覆位址就是回覆 channel 在執行期的位址。已經帶有 address 的 channel 會因此有兩個位址，AsyncAPI 不允許這種寫法。

**修法：** 用 [`@dynamicChannel`](./decorators/channels#dynamicchannel) 宣告回覆 channel，或移除 `@replyAddress`。

### `reply-without-action`

> @replyChannel or @replyAddress is applied to an operation that carries neither @send nor @receive. A reply sits on an emitted operation, so this decorator reaches no part of the document. Add @send or @receive to this operation, or remove the reply decorator.

reply 掛在輸出的 operation 上，而只有 `@send` 或 `@receive` 才會輸出 operation。

**修法：** 為該 operation 加上 `@send` 或 `@receive`，或移除 reply 的 decorator。

### `undeclared-server-variable`

> The template '{\<name\>}' in this server has no matching entry in `variables`. A reader cannot tell what to put there. The server is still emitted, with the template text unchanged. Add '\<name\>' to `variables`, or take the template out of `host` and `pathname`.

server 的 `host` 或 `pathname` 含 `{var}` 模板，但同一個 server 的 `variables` 沒有對應項目。兩個欄位的模板名稱合起來視為同一組。

**修法：** 把該名稱加進 `variables`，或從欄位中移除該模板。

### `unused-server-variable`

> The variable '\<name\>' is declared on this server, and neither `host` nor `pathname` uses a '{\<name\>}' template. The variable is still emitted. Use it in one of the two fields, or remove it.

`variables` 宣告了沒有任何模板引用的項目。AsyncAPI 只會把變數代入 `host` 與 `pathname`，所以該項目不起作用。

**修法：** 在兩個欄位其中之一使用該名稱，或刪除該項目。

### `duplicate-server-variable-value`

> The `enum` of the server variable '\<name\>' names '\<value\>' more than once. AsyncAPI requires the entries to be unique, so a repeat makes the whole document fail validation. The repeat was dropped.

server variable 的 `enum` 列出同一個值兩次。AsyncAPI 規定這些項目互不重複，重複會讓整份文件驗證失敗。

重複的項目被丟棄，該變數本身保留。若發成 error，emitter 會在寫出這份文件之前就停下來。

**修法：** 移除重複的項目。

### `server-variable-default-not-in-enum`

> The variable '\<name\>' has the default '\<default\>', which is not one of its `enum` values. A client that takes the default then holds a value the same variable forbids. Both values are still emitted.

同一個變數同時宣告 `default` 與 `enum`，而 default 不在列舉值內。AsyncAPI 不禁止這種寫法，因此兩個值都會輸出。

**修法：** 把 default 加進 `enum`，或把 default 改成列舉內的值。

### `blank-server-variable-value`

> The `\<field\>` of the server variable '\<name\>' holds an entry that is blank. A blank entry names no value, so it was dropped. A list left with no entry at all is dropped whole, and the variable is then emitted without it. Give every entry a value, or remove the ones that carry none.

server 變數的 `enum` 或 `examples` 有項目是空字串，或只有空白字元。這種項目沒有指出任何值，所以會被丟棄。整個列表都沒有項目留下時，該欄位不會出現在變數上。

**修法：** 給每個項目一個值，或刪除空白的項目。

### `blank-security-scope-name`

> The `scopes` of this security scheme hold an entry that is blank. A blank entry names no scope, so it was dropped. A list left with no entry at all still reaches the document, and AsyncAPI reads it as 'this scheme needs no scope'. Give every entry a scope name, or remove the ones that carry none.

`oauth2` 或 `openIdConnect` scheme 的 `scopes` 有項目是空字串，或只有空白字元。這種項目沒有指出任何 scope，所以會被丟棄。空的 `scopes` 仍然會寫進文件，AsyncAPI 把它讀成「這個 scheme 不需要任何 scope」。那是另一種主張。

**修法：** 給每個項目一個 scope 名稱，或刪除空白的項目。

### `use-security-outside-server`

> @useSecurity('\<schemeName\>') on namespace '\<namespace\>' was dropped. The `security` array sits on a server, and this namespace declares no @server. Move this @useSecurity to the namespace that carries @server.

`@useSecurity` 標在沒有宣告 server 的 namespace 上。emitter 把 `security` 陣列寫在 server 物件上，這次標記沒有可以落腳的位置。

**修法：** 把 `@useSecurity` 移到標有 `@server` 的 namespace，或用 `@@useSecurity` 從目前位置 augment 過去。

### `undeclared-security-scheme`

> @useSecurity('\<schemeName\>') names a security scheme that no @securityScheme defines. The emitted reference would point at nothing, and no parser could resolve it. This entry was dropped. Declare a @securityScheme with this name, or correct the name.

`@useSecurity` 指定的名稱，程式中沒有任何 `@securityScheme` 定義。server 上的項目是指向 `components.securitySchemes` 的 `$ref`，這個 `$ref` 會指到文件中不存在的 key。

**修法：** 新增同名的 `@securityScheme`，或修正 `@useSecurity` 的名稱。

### `message-key-shadows-schema-key`

> Message name '\<name\>' is also the components.schemas key of a different type, so a reader can misread this message as describing that type. A message key drops the namespace prefix that a schema key keeps, which makes the two overlap. Pass a different name to @message.

文件本身仍然合法——`components.messages` 與 `components.schemas` 是兩個獨立的 map，實際上沒有撞到。風險在讀的人：`components.messages.Sales.Ev` 與 `components.schemas["Sales.Ev"]` 看起來像同一個東西，描述的卻是不同型別。

**修法：** 對 `@message` 傳入不同的名稱。

### `sanitized-message-key`

> Message name '\<requested\>' is not a legal components.messages key, so it was emitted as '\<emitted\>'. A key may only use the characters a-z, A-Z, 0-9, '.', '-', and '_'.

傳給 `@message` 的名稱超出 Components Object 的合法字元集，emitter 已把違規字元編碼。因此實際輸出的 key 並不是當初要求的字串。

**修法：** 改用只含 `a-z`、`A-Z`、`0-9`、`.`、`-`、`_` 的名稱。

### `unknown-schema-format`

> '\<format\>' is not one of the schemaFormat values AsyncAPI requires or recommends. A custom value is legal, so this one is still emitted. A custom value must not be one of the listed identifiers used with another meaning. Check the spelling, and note that every listed value carries a version, such as 'application/vnd.apache.avro;version=1.9.0'.

傳給 [`@rawPayload`](./decorators/messages#rawpayload) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 的 `schemaFormat` 不在 AsyncAPI 列出的值裡面。該清單包含工具必須支援的值，以及規格建議的值。常見原因是漏了 `;version=` 這一段。

這個值仍然會輸出，因為規格允許自訂值。規格同時規定，自訂值不得與清單中的識別字撞名。emitter 無法檢查這條規則，因為它看不出清單中的識別字被賦予了另一種意義。所以這條規則寫在警告訊息裡。

**修法：** 檢查拼寫；若這個值本來就是你自訂的格式，忽略這個警告。

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

### `inherited-header-overridden`

> The field '\<field\>' is lifted into the `headers` of message '\<base\>'. Message '\<message\>' extends '\<base\>' and describes its own headers with @headers or @rawHeaders, so the lift is cancelled and the field stays in the payload of '\<message\>'.

基底 message 用 `@header` 把某個欄位抽出到它的 `headers`。衍生的 message 改用 [`@headers`](./decorators/messages#headers) 或 [`@rawHeaders`](./decorators/messages#rawheaders) 描述自己的 headers，這會整份取代原本的抽出。該欄位於是同時是基底的 header，又是衍生 message 的 payload 資料。

emitter 採用衍生 message 自己的宣告。兩種解讀都說得通，所以這個衝突會回報，而不是靜默決定。

**修法：** 把該欄位加進衍生 message 的 headers schema；或移除那個 decorator，讓衍生 message 沿用原本的抽出。

### `unserializable-message-example`

> This @messageExample could not be serialized to JSON and was dropped from the emitted message.

`@messageExample` 的值含有 compiler 無法序列化為純 JSON 的內容（不支援的 scalar 建構式、格式錯誤的 `duration.fromISO(...)` 值等）。該筆整筆丟棄，連同其中本來可以序列化的欄位。只保留一半 payload 的範例會描述出應用程式從不發送的 message。

**修法：** 把範例值改寫成可用 JSON 表示的部分。

### `extension-target-not-emitted`

> @extension sits on a target that emits no info, channel, operation, or message object, so it reaches no part of the document. Every @extension here was dropped. Move it to the service namespace, a channel, an operation, or a @message model.

[`@extension`](./decorators/document-info#extension) 接受任何 target，因為 AsyncAPI 允許每個物件帶規格擴充。這個 emitter 只寫四種物件：`info`、channel、operation 與 message。target 不產生其中任何一種時，這次套用到不了文件的任何位置。

server 與 security scheme 就是這種 target。兩者都以具名參數宣告在 namespace 上，所以一個 `@extension` 指不出它要的是哪一個。

一個 target 只回報一次，不論它帶幾個 key。錯的是位置，不是每一個 key。

**修法：** 把這次套用移到 service namespace、`@channel` interface、`@send`／`@receive` operation，或 `@message` model 上。

### `unserializable-extension`

> The value of the extension key '\<key\>' could not be serialized to JSON, so this @extension was dropped. Give the key a value the emitter can write.

傳給 [`@extension`](./decorators/document-info#extension) 的值含有 compiler 無法序列化成純 JSON 的內容，例如不支援的 scalar 建構式。整次套用被丟棄。把這種值記下來，最後只會在寫檔時讓那個 key 無聲消失。

同一個 target 上其他次套用不受影響。

**修法：** 把值簡化成 JSON 可表示的內容。

### `unserializable-default`

> This property's default value could not be serialized to JSON and was omitted from the emitted schema.

屬性的預設值（寫法是 `name?: T = value`）含有 compiler 無法序列化成純 JSON 的內容。`default` 關鍵字被省略，schema 其餘部分不受影響。只序列化一半的預設值，等於把 schema 自己會拒絕的值寫進 schema。

**修法：** 把預設值簡化成 JSON 可表示的內容。

### `visibility-not-applied`

> @visibility does not change an AsyncAPI message. A message has one shape, not a shape per lifecycle phase, so this property is emitted in full. Use @invisible to leave a property out of the document.

[`@visibility`](https://typespec.io/docs/language-basics/visibility/) 讓一個 model 依生命週期階段有多種形狀。AsyncAPI message 沒有階段之分，它只有一種形狀、只送出一次。emitter 因此沒有階段可挑，會完整輸出該屬性。

`@invisible(Lifecycle)` 不同。它表示該屬性不屬於任何階段，這句話不需要挑階段就能解讀，所以 emitter 會照做，把該屬性排除在外，這種情況不會回報任何訊息。

**修法：** 要讓屬性不出現在文件裡，改用 `@invisible(Lifecycle)`；若該屬性本來就該出現在 message 裡，移除 `@visibility`。

### `unrepresentable-numeric-constraint`

> This @\<decorator\> constraint could not be represented as a JSON number (its value overflows or loses precision as a JS number) and was omitted from the emitted schema.

`@minValue` / `@maxValue` / `@minLength` 等的邊界值以 JavaScript number 表示時溢位或掉精度，例如 `int64` 上的 `@maxValue(9223372036854775807)`。該關鍵字被省略，不會輸出壞掉的值。

**修法：** 改用 double 可精確表示的邊界值（±2^53 以內），或移除該限制。

### `unsupported-temporal-range-constraint`

> This @\<decorator\> constraint targets a date/time/duration value, which draft-07 JSON Schema cannot express as a `minimum`/`maximum`, and was omitted from the emitted schema.

`@minValue` / `@maxValue` 標在時間類 scalar（`utcDateTime`、`plainDate`、`duration` 等）上。這些 scalar 輸出為 `type: string`，draft-07 沒有能約束字串日期範圍的關鍵字。

**修法：** 移除該限制，或改以 `@doc` 用文字描述。

### `encoding-describes-no-variant`

> @encode("\<encoding\>") describes none of the variants of this union, so the encoding was left out of the emitted schema. Each variant keeps the shape its own type states.

`@encode` 標在 union 型別的屬性上，但沒有任何一個 variant 是該編碼描述的型別，例如 `@encode("ISO8601") d: utcDateTime | null`。ISO 8601 描述的是 `duration` 的傳輸格式，這兩個 variant 都不是 `duration`。編譯器接受這個 decorator，所以這是作者唯一會收到的提示。

**修法：** 改用能對應到其中一個 variant 的編碼，或把屬性型別換成該編碼描述的型別。

### `missing-discriminator-property`

> @discriminator("\<property\>") names a property that is not defined on this model. AsyncAPI requires the discriminating property to be defined here, so `discriminator` was omitted from the emitted schema.

**修法：** 在該 model 或父層上宣告這個屬性，或修正 `@discriminator` 裡的屬性名稱。指名用的是 **TypeSpec** 屬性名稱，不是 `@encodedName` 的 wire name。

### `optional-discriminator-property`

> @discriminator("\<property\>") names a property that is optional on this model. AsyncAPI requires the discriminating property to be required, so `discriminator` was omitted from the emitted schema.

**修法：** 把 discriminating 屬性改成必填（移除 `?`）。

### `encoded-name-override-conflict`

覆寫屬性的 `@encodedName` 與父層同名屬性的 wire name 不同。一般的 `allOf: [$ref Base, own]` 形狀會同時要求**兩個** wire name，導致任何合法 payload 都被拒絕。emitter 改為攤平該 model 的 schema（繼承屬性內嵌，不再 `$ref` 基底）。

**修法：** 讓覆寫屬性用與父層相同的 `@encodedName`，或只在其中一層改名。

### `never-typed-property-override`

屬性宣告為 `never` 以移除繼承屬性，但基底的 `$ref` 分支仍會要求它。emitter 同樣改為攤平 schema（`never` 屬性省略）。

**修法：** 若攤平可接受則不需處理，此警告只說明形狀改變。否則調整繼承結構，讓該屬性一開始就不被繼承。

### `binding-outside-document`

> A '\<protocol\>' binding for the \<level\> level sits on a target that emits no such object, so it reaches no part of the document. This binding was dropped. Add the decorator that emits the object: @channel or @dynamicChannel for a channel, @send or @receive for an operation, @message for a message, and @server on the service namespace for a server.

binding 依附在 target 產生的物件上。target 不產生物件時，該 binding 不會有任何效果。

`@binding` 沒有指定層級，因此它回報另一段訊息。那段訊息列出四種物件，不指名單一層級。

**修法：** 補上會產生該物件的 decorator，或移除該 binding。

### `invalid-binding-field`

> The \<protocol\> binding field '\<field\>' expects \<expected\>. The value given here is outside that, so the field was dropped and the rest of the binding was kept.

某個欄位的值違反 binding 規格。Kafka binding 會對 `partitions`、`replicas`、`topicConfiguration`、`cleanup.policy`、`schemaIdLocation`、`key`、`groupId` 與 `clientId` 回報。

`topicConfiguration` 是在序列化器無法表示對應表中某個成員時回報。帶有 `init` 的自訂 scalar 就是這種成員。該成員會讓整份對應表失敗，所以回報指的是 `topicConfiguration`，不是那個成員。

binding 的其餘部分照樣輸出。少了就寫不出 binding 的欄位代價更高，它改為回報 [`invalid-required-binding-field`](#invalid-required-binding-field)。

**修法：** 依訊息指出的範圍填值。

### `conflicting-message-schema-source`

> This message carries a payload written with @rawPayload, and the preview feature '\<provider\>' generated one for it too. The authored schema is the explicit statement of the two, so the document carries it and the generated one was dropped. Remove @rawPayload from this model, or turn '\<provider\>' off in `preview-features` in `tspconfig.yaml`.

model 上有 `@rawPayload`，同時又有[預覽功能](./emitter-options#預覽功能)為它產生 payload schema。

手寫的那份勝出。它是兩者中明示的一份，被產生的 schema 蓋掉會讓作者寫的內容從文件中消失。

**修法：** 從 model 移除 `@rawPayload` 以改用產生的 schema，或從 `preview-features` 移除該功能以繼續手寫 payload。
