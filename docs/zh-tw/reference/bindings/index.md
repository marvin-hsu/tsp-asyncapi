# 通訊協定 binding

AsyncAPI 用 Bindings Object 描述特定通訊協定的設定。規格把它放在四種物件上：server、channel、operation 與 message。該物件的每一個成員各代表一個通訊協定，例如 `kafka`。

本 library 為十三個通訊協定提供 decorator：Kafka、WebSocket、MQTT、HTTP、AMQP、NATS、Pulsar、Google Cloud Pub/Sub、Amazon SQS、Anypoint MQ、JMS、IBM MQ 與 Solace。另外提供通用的 `@binding`，供 AsyncAPI 保留但未定義欄位的那些名稱使用。

一個通訊協定在一個物件上只佔一個成員。兩個 decorator 在同一個物件上宣告同一個成員是錯誤。emitter 不會合併兩份設定，後寫的那份也不會取代先寫的那份。

## 通訊協定一覽

| 通訊協定                                | 成員           | 版本  | 物件                                |
| --------------------------------------- | -------------- | ----- | ----------------------------------- |
| [Kafka](./kafka)                        | `kafka`        | 0.5.0 | server／channel／operation／message |
| [WebSocket](./websocket)                | `ws`           | 0.1.0 | channel                             |
| [MQTT](./mqtt)                          | `mqtt`         | 0.2.0 | server／operation／message          |
| [HTTP](./http)                          | `http`         | 0.3.0 | operation／message                  |
| [AMQP 0-9-1](./amqp)                    | `amqp`         | 0.3.0 | channel／operation／message         |
| [NATS](./nats)                          | `nats`         | 0.1.0 | operation                           |
| [Pulsar](./pulsar)                      | `pulsar`       | 0.1.0 | server／channel                     |
| [Google Cloud Pub/Sub](./google-pubsub) | `googlepubsub` | 0.2.0 | channel／message                    |
| [Amazon SQS](./sqs)                     | `sqs`          | 0.2.0 | channel／operation                  |
| [Anypoint MQ](./anypoint-mq)            | `anypointmq`   | 0.0.1 | channel／message                    |
| [JMS](./jms)                            | `jms`          | 0.0.1 | server／channel／message            |
| [IBM MQ](./ibm-mq)                      | `ibmmq`        | 0.1.0 | server／channel／message            |
| [Solace](./solace)                      | `solace`       | 0.4.0 | server／operation                   |

## `@binding`

```typespec
extern dec binding(target: unknown, protocol: valueof string, config: valueof unknown);
```

在 target 產生的物件上加入一個原樣的 binding。用於新版 binding 才加入的欄位，以及下方那三個沒有欄位的通訊協定。

::: warning
Bindings Object 的成員名稱是**封閉清單**。AsyncAPI 逐一列出它認得的通訊協定，其他名稱會被 parser 以「Property '\<name\>' is not expected to be here」拒絕。所以 `@binding("mycorp", ...)` 會產生一份無法通過驗證的文件。

要放自訂的通訊協定，名稱請以 `x-` 開頭。那是規格擴充機制，parser 在任何位置都接受。
:::

設定內容原樣輸出。這個 decorator 不加 `bindingVersion`。它不解讀設定的形狀，因此無法判斷欄位屬於哪一版。通訊協定需要該欄位時，自行寫進設定裡。

```typespec
@binding("mqtt", #{ qos: 2, retain: true })
@channel("orders.created")
interface OrderChannel {
  @send
  op publish(event: OrderCreated): void;
}
```

```yaml
channels:
  orders.created:
    address: orders.created
    bindings:
      mqtt:
        qos: 2
        retain: true
```

target 是 `unknown`，因為四個位置都可能是目標。這個 decorator 不指定層級。binding 會落在 target 所產生的物件上。

::: warning
一個 namespace 可以同時是 service namespace 與 channel 的目標。此時 `@binding` 會同時進入 server 與 channel。若只想指定其中一個，改用專屬的 decorator。
:::

## 沒有具名 decorator 的通訊協定

AsyncAPI 另外保留五個成員名稱。本 library 不為它們提供 decorator，理由有兩個。

`amqp1`、`redis` 與 `stomp` 會被 AsyncAPI parser 接受，而三者都沒有任何欄位。具名 decorator 沒有東西可以驗證，也沒有版本可以寫，所以 `@binding("redis", #{})` 已經說完它們能說的全部。

`mercure`、`mqtt5` 與 `ros2` 在 AsyncAPI 3.0 文件的四個層級都會被 AsyncAPI parser 拒絕。帶有這些成員的文件無法通過驗證，所以本 library 既不提供 decorator，也不建議用通用機制產生它們。

## 跨物件的規則

::: warning
有四個 Kafka 欄位需要 schema registry。registry 的網址在 server binding 上。Kafka binding 規格說明，沒有 server 層級的 `schemaRegistryUrl` 時，不得使用下列欄位：

- `schemaRegistryVendor`，在 server binding 上
- `schemaIdLocation`，在 message binding 上
- `schemaIdPayloadEncoding`，在 message binding 上
- `schemaLookupStrategy`，在 message binding 上

emitter 不檢查這些規則。每一條都橫跨文件的兩個物件。使用上述任一欄位時，請在 service namespace 上設定 `schemaRegistryUrl`。
:::

## binding 版本

每個具名 binding 都帶有它所依循的規格版本。emitter 一律寫入這個欄位，也無法透過 decorator 更改。各通訊協定的版本見上方的一覽表。

AsyncAPI 規定，欄位不存在時讀取端必須當成 `latest`。`latest` 的內容會隨時間改變，所以版本一律寫出。

`@binding` 完全不寫版本。需要版本時，自行加進設定裡。

## 診斷訊息

| 代碼                       | 嚴重度  | 情境                                                 |
| -------------------------- | ------- | ---------------------------------------------------- |
| `duplicate-binding`        | error   | 同一個 target 的同一層級上，一個通訊協定被宣告兩次。 |
| `empty-binding-protocol`   | error   | `@binding` 的通訊協定名稱是空白。                    |
| `invalid-binding-config`   | error   | `@binding` 的設定不是物件。                          |
| `invalid-binding-field`    | warning | 某個 binding 欄位的值違反規格。                      |
| `binding-outside-document` | warning | binding 所在的 target 不會產生對應的物件。           |
| `missing-binding-field`    | error   | binding 沒有給規格要求的欄位。                       |

`invalid-binding-field` 是 warning，因為 emitter 只丟掉那一個欄位。binding 的其餘欄位保留，文件也照常產出。其餘代碼是 error，因為它們各自丟掉整個 binding。缺少必填欄位的 binding 無法寫成合法文件，作者也就沒有任何殘留可以檢查。

完整清單見[診斷訊息](/zh-tw/reference/diagnostics)。
