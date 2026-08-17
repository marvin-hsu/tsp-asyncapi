# Pulsar

The Pulsar binding. The emitted member is `pulsar`, and every object carries `bindingVersion: 0.1.0`.

## `@pulsarServer`

```typespec
extern dec pulsarServer(target: Namespace, config: valueof AsyncAPIPulsarServerBinding);
```

| Field    | Type     | Required |
| -------- | -------- | -------- |
| `tenant` | `string` | no       |

Apply it to the service namespace. A topic is addressed as `<tenant>/<namespace>/<topic>`, so this field and the channel `namespace` are two parts of one address.

## `@pulsarChannel`

```typespec
extern dec pulsarChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIPulsarChannelBinding
);
```

| Field            | Type                      | Required |
| ---------------- | ------------------------- | -------- |
| `namespace`      | `string`                  | **yes**  |
| `persistence`    | `string`                  | **yes**  |
| `compaction`     | `int32`                   | no       |
| `geoReplication` | `string[]`                | no       |
| `retention`      | `AsyncAPIPulsarRetention` | no       |
| `ttl`            | `int32`                   | no       |
| `deduplication`  | `boolean`                 | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

::: warning
`namespace` is a TypeSpec keyword. Write the field name in backticks: `` `namespace`: "orders" ``. The emitted field is still `namespace`.
:::

`namespace` and `persistence` are required. A binding without either one is reported through `missing-binding-field` and dropped whole. `persistence` is `persistent` or `non-persistent`.

`geoReplication` is written under that name because a TypeSpec field name cannot hold a dash. The emitted field is `geo-replication`.

`retention.time` and `retention.size` are zero or more. Zero disables retention on that measure.
