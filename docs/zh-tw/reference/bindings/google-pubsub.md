# Google Cloud Pub/Sub

Google Cloud Pub/Sub binding。輸出的成員是 `googlepubsub`，每個物件都帶 `bindingVersion: 0.2.0`。

## `@googlePubSubChannel`

```typespec
extern dec googlePubSubChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIGooglePubSubChannelBinding
);
```

| 欄位                       | 型別                                 | 必填   |
| -------------------------- | ------------------------------------ | ------ |
| `schemaSettings`           | `AsyncAPIGooglePubSubSchemaSettings` | **是** |
| `labels`                   | `Record<unknown>`                    | 否     |
| `messageRetentionDuration` | `string`                             | 否     |
| `messageStoragePolicy`     | `AsyncAPIGooglePubSubStoragePolicy`  | 否     |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

`schemaSettings` 是必填，它自己又要求 `encoding` 與 `name`。缺這些時，binding 會透過 `missing-binding-field` 回報並整個丟棄。

`labels` 是開放的 map。Pub/Sub 對它的鍵與值都沒有規定，所以原樣輸出。

## `@googlePubSubMessage`

```typespec
extern dec googlePubSubMessage(
  target: Model,
  config: valueof AsyncAPIGooglePubSubMessageBinding
);
```

| 欄位          | 型別                         | 必填 |
| ------------- | ---------------------------- | ---- |
| `attributes`  | `Record<unknown>`            | 否   |
| `orderingKey` | `string`                     | 否   |
| `schema`      | `AsyncAPIGooglePubSubSchema` | 否   |

套用在同時帶有 `@message` 的 model 上。沒有必填欄位。

`schema` 是選填，但寫了 `schema` 卻沒寫 `name` 等於沒指名任何 schema，所以會被回報並丟棄。
