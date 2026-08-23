# 變更記錄

本專案遵循[語意化版本](https://semver.org/lang/zh-TW/)。目前仍在 `0.x`，所以
minor 版可能帶破壞性變更。有帶的話會寫在該版項目的最上方。

英文版在 [CHANGELOG.md](./CHANGELOG.md)。

## 0.4.0

**對在 JavaScript 或 TypeScript 裡 import 這個套件的工具是 breaking。
對寫 TypeSpec 的專案不是。**

emitter 現在是兩個套件。`tsp-asyncapi-core` 宣告 decorator 與語意模型，
這個套件把那份模型轉成 AsyncAPI 文件。compiler 從套件的進場點讀 `$onEmit`，
所以一個套件只能有一個 emitter，而「用套件名稱選產出」需要多個套件。

**TypeSpec 專案不用改任何東西。** `import "tsp-asyncapi";` 仍然帶進每一個
decorator，因為這個套件的 `lib/main.tsp` 用一行轉接到 core。`tspconfig.yaml`
不變，每個選項名稱也不變。每個 diagnostic 代碼都保留 `tsp-asyncapi/` 前綴：
兩個套件都以這一個名稱註冊 library，compiler 支援這種做法。

**輸出逐位元相同。** 沒有任何文件改變。

兩個套件獨立發版。這一個是 0.4.0,延續你已經有的歷史;`tsp-asyncapi-core` 是新的,
從 0.1.0 起算。兩者之間的相依是 `~` 範圍,所以 core 發一個 minor 不會直接進到專案,
要這個套件先取用。

**JavaScript 或 TypeScript 的 import 來源可能要改。** 有 79 個名稱搬到
`tsp-asyncapi-core`：24 個 decorator state 讀取函式、51 個 state 型別，
以及 `$lib` 與 `reportDiagnostic`、`createDiagnostic`、`LIBRARY_NAME`。

```js
// 之前
import { getChannel, listMessages } from "tsp-asyncapi";
// 之後
import { getChannel, listMessages } from "tsp-asyncapi-core";
```

這個套件不轉出它們。轉出等於讓它永久替 core 的公開面負責，而那正是拆分要
解掉的耦合。`@typespec/openapi3` 也不轉出 `@typespec/http`。

文件物件型別沒有搬。`AsyncAPIDocument`、`ChannelObject`、每個 binding 物件，
以及其餘的，仍然從 `tsp-asyncapi` import。這個套件的 API 完整描述它產出的文件。

`PACKAGE_NAME` 是新的。它是這個套件的名稱，也就是 `tspconfig.yaml` 寫的名稱、
以及測試主機請 compiler 載入的名稱。

## 0.3.0

**行為變更。** 沒有移除任何公開匯出，也沒有 decorator 改過簽章，所以從 0.2.1
升級不需要改一行 TypeSpec。但有五項檢查放寬或收緊了，每一項都可能改變既有程式
的輸出或回報。重新產生文件並看 diff。

- `asyncapi-id` 與 `default-content-type` 兩個選項現在遵循文件其餘文字欄位的同
  一條規則：空白的選項視為缺席，有內容的選項會 trim。兩者原本是裸的真值判斷，
  所以空白選項會進到文件，帶前後空白的選項會保留空白。選項的 schema 沒有設最小
  長度，所以作者寫得出這兩種值。
- raw schema 的 `$ref` 裡的 array 索引，現在只接受 RFC 6901 拼得出來的形式：`0`
  或無前導零的數字串。原本把 token 交給 `Number`，而它把 `""` 與 `" "` 都讀成
  0，把 `"01"`、`"1.0"`、`"+1"`、`"0x1"`、`"1e0"` 都讀成 1。這種 `$ref` 原本被判
  定為解析成功，現在回報 `unresolved-raw-schema-ref`——所以帶著這種寫法的程式會
  開始出現原本沒有的回報。
- 序列化不了的值現在會被回報並丟棄，不論它埋得多深。原本埋在 array 裡的失敗會以
  `null` 進到文件，埋在 object 裡的則讓那個成員直接消失，兩者都沒有任何提示。這
  項變更同時涵蓋 `@binding` 與 `@jsonSchemaExtension`，不只 `@extension`。
- runtime expression 的 JSON Pointer token 現在可以含換行字元。RFC 6901 對
  reference token 沒有字元限制，而 JSON 與 YAML 的成員名稱都載得動換行。
  `@correlationId`、`@parameterLocation`、`@replyAddress` 都吃這種運算式。
- tag metadata 的衝突現在每個宣告只回報一次。原本是每個讀取端各報一次，所以
  service namespace 上的一個衝突會被報兩到三次，取決於該 namespace 是否同時帶著
  server 或 channel。

### 新功能

- `@extension` 在 target 產出的物件上寫一個 `x-` 規格擴充。它能到達四種物件：
  `info`、channel、operation、message。一個 target 產出多個物件時，每個都會掛
  上。這個 decorator 可重複套用，輸出的 key 依原始碼順序排列。值可以是任何 JSON
  值，並原樣輸出。

  key 不符規格樣式時回報 `invalid-extension-key`；光看前綴不夠，因為官方 parser
  會拒絕 `x-` 與 `x-has space`。同一個 target 上同一個 key 套用兩次回報
  `duplicate-extension-key`，保留原始碼順序在前的那次。序列化不了的值回報
  `unserializable-extension`。target 不產出上述四種物件時回報
  `extension-target-not-emitted`。

  server 與 security scheme 不支援。兩者都是用 namespace 上的具名引數宣告的，所
  以一個 `@extension` 無法指定它要落在哪一個上。要寫 JSON Schema 內的關鍵字，用
  `@jsonSchemaExtension`。

### 測試

測試套件現在有 53 條 fast-check 性質，涵蓋七個純模組，原本是 15 條。每一條都經過
突變驗證：把它涵蓋的模組照計劃指定的方式改壞，該條性質必須轉紅。上面五項行為變
更裡有三項，就是這些性質找出來的缺陷。

### 文件

- 新增第十五個範例，在每一種能承載 `x-` 的物件上各寫一個。
- 其餘十四份文件重新產生過。它們從 0.2.1 之後就沒重建，所以 commit 進 repo 的輸
  出仍然是 0.2.0 的 channel key 與折行結果。
- 兩份 README 記下一件這個 emitter 修不了的事。decorator 的 object value 裡名稱
  是 `__proto__` 的成員永遠到不了 emitter：compiler 把這種值逐個成員賦值，而對
  這個名稱賦值是設定原型，不是新增成員。

## 0.2.1

**破壞性變更。** 沒有明確指定 `channelId` 時，`@channel` 現在以 address 當這個
channel 的 key，而不是 target 的宣告名稱。用 Kafka 這類 broker 時，address 就是
topic 名稱，而讀者也是用 topic 名稱找 channel。`@dynamicChannel` 仍然用宣告名
稱，因為它沒有 address。要保留舊的 key，把它當 `channelId` 傳進去。每個指向
channel 的 `$ref` 都跟著 key 變，所以重新產生文件並看 diff。

兩個沒有明確 id 而共用同一個 address 的 channel，現在會撞 key 並回報
`duplicate-channel-id`。原本兩者都會輸出，只透過 `duplicate-channel-address`
警告。把同一個 address 的 operation 宣告在同一個範圍內，或給每個 channel 自己的
`channelId`。

### 修正

- 超過 80 欄的 `$ref` 不再被折成兩行。折行的 `$ref` 是合法 YAML，但用純文字搜尋
  那個 pointer 就找不到它。

### 文件

- `components.schemas` 與 `components.messages` 的 key 規則寫下來了：namespace
  的限定方式、`@friendlyName` 覆寫什麼，以及字元集之外的字元會被怎麼改寫。
- operation 頁面新增一個 operation 承載多則 message 的範例，那是一個 topic 帶多
  種事件變體時的常見寫法。

## 0.2.0

新增十二個通訊協定，而且 emitter 現在會檢查每一個的欄位規則，不再把收到的東西
原樣傳過去。

沒有移除任何公開匯出，也沒有 decorator 改過簽章，所以從 0.1.4 升級不需要改一行
TypeSpec。

輸出確實變了，但只變在 0.1.4 原本就錯的地方。有六個 decorator 原本被讀取後就丟
棄，所以用到其中任何一個的原始碼，現在產出的東西比以前多。`@discriminated` 原本
輸出一個裸的 `anyOf`，現在輸出規格描述的那層封裝。commit 之前先重新產生並讀
diff：每一處差異都應該是你本來就想要的東西。下面的「修正」一節列出它們。

### 通訊協定 binding

0.1.4 出了四個 Kafka decorator 與通用的 `@binding`。現在多了十二個通訊協定，合計
三十一個 binding decorator。

| 通訊協定             | 成員名稱       | Binding 版本 | 物件                        |
| -------------------- | -------------- | ------------ | --------------------------- |
| MQTT                 | `mqtt`         | 0.2.0        | server, operation, message  |
| HTTP                 | `http`         | 0.3.0        | operation, message          |
| AMQP 0-9-1           | `amqp`         | 0.3.0        | channel, operation, message |
| NATS                 | `nats`         | 0.1.0        | operation                   |
| Pulsar               | `pulsar`       | 0.1.0        | server, channel             |
| Google Cloud Pub/Sub | `googlepubsub` | 0.2.0        | channel, message            |
| Amazon SQS           | `sqs`          | 0.2.0        | channel, operation          |
| Anypoint MQ          | `anypointmq`   | 0.0.1        | channel, message            |
| JMS                  | `jms`          | 0.0.1        | server, channel, message    |
| IBM MQ               | `ibmmq`        | 0.1.0        | server, channel, message    |
| Solace               | `solace`       | 0.4.0        | server, operation           |
| WebSocket            | `ws`           | 0.1.0        | channel                     |

每一張欄位表都是從 `@asyncapi/specs` 的 JSON schema 讀出來的，不是從散文讀的，所
以成員名稱、允許值與範圍都是官方 parser 實際會強制的那些。每個通訊協定都對那個
parser 做過端到端驗證。

具名的 decorator 會替你寫 `bindingVersion`，所以作者不可能再寫錯。

有五個保留的成員名稱沒有 decorator，參考頁面說明了原因。`amqp1`、`redis` 與
`stomp` 完全沒有欄位。`mercure`、`mqtt5` 與 `ros2` 在 3.0 文件的每一層都會被
AsyncAPI parser 拒絕。

### 診斷訊息

四個新代碼。

- `missing-binding-field`（error）。缺少規格必填欄位的 binding 寫不成合法文件，
  所以整個 binding 被丟棄。Pulsar 需要 `namespace` 與 `persistence`，Pub/Sub 需要
  `schemaSettings`，SQS 需要 `queue` 與 `queues`，JMS 需要
  `jmsConnectionFactory`。一個物件缺的每個欄位都會回報，不只第一個。
- `duplicate-channel-address`（warning）。兩個 channel 共用一個 address 會產生合
  法的文件，但讀者分不出那個 address 實際承載哪一組 message。
- `visibility-not-applied`（warning）。emitter 無法處理的 `@visibility` 會被回
  報，不再靜默忽略。
- `unserializable-default`（warning）。序列化器表達不了的預設值會被省略，而不是
  寫一半。

### 修正

- model 上的 `@externalDocs` 原本到不了文件的任何地方。現在會落在該 model 的
  schema 上。
- `@encode`、`@invisible`、`@visibility`、`@secret`、屬性預設值與 `#deprecated`
  原本都被讀取後丟棄。六者現在都會進到 schema。
- `@discriminated` 原本輸出裸的 `anyOf`，而不是 AsyncAPI 描述的那層封裝。
- message 的輸出順序原本會取決於哪一次建置在跑，而且某次建置消耗掉的 binding 可
  能對下一次建置仍標記著。兩者都沒了；emitter 不在建置之間保留狀態。
- service namespace 的 tag 原本到不了 server，雖然 Server Object 有定義這個欄位。
- IBM MQ 只允許 binary payload 帶 `headers`，其他情況不允許。emitter 原本兩者都
  放行，寫出 parser 會拒絕的文件。

### 兩個欄位名稱需要反引號

AMQP channel binding 的 `is` 與 Pulsar channel binding 的 `namespace` 都是
TypeSpec 關鍵字，所以作者要寫成 `` `is` `` 與 `` `namespace` ``。輸出的名稱不變。

### 內部

emitter 現在是三階段管線：`resolve` 把 program 與 decorator state 轉成語意模型，
`lower` 把那個模型轉成文件，serialize 寫出位元組。階段之間只交接值，這正是將來能
做 versioning 與多 service 輸出的前提。

這次沒有改變任何輸出。十個程式的逐位元基準線在每一步都維持一致。

## 0.1.4 以及更早

沒有保留變更記錄。請看 commit 歷史。
