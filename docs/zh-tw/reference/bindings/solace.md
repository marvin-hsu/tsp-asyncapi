# Solace

Solace binding。輸出的成員是 `solace`，每個物件都帶 `bindingVersion: 0.4.0`。

## `@solaceServer`

```typespec
extern dec solaceServer(target: Namespace, config: valueof AsyncAPISolaceServerBinding);
```

| 欄位         | 型別     | 必填 |
| ------------ | -------- | ---- |
| `msgVpn`     | `string` | 否   |
| `clientName` | `string` | 否   |

套用在服務 namespace 上。`clientName` 最長 160 個字元。

輸出的欄位是 `msgVpn`。Solace binding 的 0.2.0 版把它拼成 `msvVpn`，本 library 輸出 0.4.0 版。

## `@solaceOperation`

```typespec
extern dec solaceOperation(target: Operation, config: valueof AsyncAPISolaceOperationBinding);
```

| 欄位           | 型別        | 必填 |
| -------------- | ----------- | ---- |
| `destinations` | `unknown[]` | 否   |
| `timeToLive`   | `int32`     | 否   |
| `priority`     | `int32`     | 否   |
| `dmqEligible`  | `boolean`   | 否   |

套用在帶有 `@send` 或 `@receive` 的 operation 上。

`destinations` 的每一筆可以帶 `deliveryMode`，值為 `direct` 或 `persistent`。其他值會被回報並從該筆丟棄，該筆的其餘欄位保留。一筆的其餘欄位原樣輸出。

`priority` 是零或以上。
