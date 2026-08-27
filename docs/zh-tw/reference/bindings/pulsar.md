---
title: "Pulsar"
description: "Pulsar binding。輸出的成員是 `pulsar`，每個物件都帶 `bindingVersion: 0.1.0`。"
---

# Pulsar

Pulsar binding。輸出的成員是 `pulsar`，每個物件都帶 `bindingVersion: 0.1.0`。

## `@pulsarServer`

```typespec
extern dec pulsarServer(target: Namespace, config: valueof AsyncAPIPulsarServerBinding);
```

| 欄位     | 型別     | 必填 |
| -------- | -------- | ---- |
| `tenant` | `string` | 否   |

套用在service namespace 上。topic 的位址是 `<tenant>/<namespace>/<topic>`，所以這個欄位和 channel 的 `namespace` 是同一個位址的兩個部分。

```typespec
@service(#{ title: "Orders" })
@server("pulsar", #{ host: "pulsar.example.com:6650", protocol: "pulsar" })
@pulsarServer(#{ tenant: "acme" })
namespace Orders;
```

```yaml
servers:
  pulsar:
    host: pulsar.example.com:6650
    protocol: pulsar
    bindings:
      pulsar:
        tenant: acme
        bindingVersion: 0.1.0
```

## `@pulsarChannel`

```typespec
extern dec pulsarChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIPulsarChannelBinding
);
```

| 欄位             | 型別                      | 必填   |
| ---------------- | ------------------------- | ------ |
| `namespace`      | `string`                  | **是** |
| `persistence`    | `string`                  | **是** |
| `compaction`     | `int32`                   | 否     |
| `geoReplication` | `string[]`                | 否     |
| `retention`      | `AsyncAPIPulsarRetention` | 否     |
| `ttl`            | `int32`                   | 否     |
| `deduplication`  | `boolean`                 | 否     |

套用在帶有 `@channel` 或 `@dynamicChannel` 的 interface 或 namespace 上。

::: warning
`namespace` 是 TypeSpec 的保留字。欄位名稱要用反引號寫成 `` `namespace`: "orders" ``。輸出的欄位仍然是 `namespace`。
:::

`namespace` 與 `persistence` 是必填。缺任一個時，binding 會透過 `missing-binding-field` 回報並整個丟棄。`persistence` 是 `persistent` 或 `non-persistent`。

`geoReplication` 用這個名稱，是因為 TypeSpec 的欄位名稱不能帶連字號。輸出的欄位是 `geo-replication`。

`retention.time` 與 `retention.size` 是零或以上。零表示關閉該項保留。

```typespec
@pulsarChannel(#{
  `namespace`: "orders",
  persistence: "persistent",
  compaction: 1000,
  retention: #{ time: 168, size: 1024 },
  ttl: 3600,
  deduplication: true,
  geoReplication: #["us-east", "eu-west"]
})
@channel("persistent://acme/orders/created")
interface OrderChannel {}
```

```yaml
channels:
  persistent://acme/orders/created:
    address: persistent://acme/orders/created
    bindings:
      pulsar:
        namespace: orders
        persistence: persistent
        compaction: 1000
        geo-replication:
          - us-east
          - eu-west
        retention:
          time: 168
          size: 1024
        ttl: 3600
        deduplication: true
        bindingVersion: 0.1.0
```
