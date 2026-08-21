---
title: "Solace"
description: "The Solace binding. The emitted member is `solace`, and every object carries `bindingVersion: 0.4.0`."
---

# Solace

The Solace binding. The emitted member is `solace`, and every object carries `bindingVersion: 0.4.0`.

## `@solaceServer`

```typespec
extern dec solaceServer(target: Namespace, config: valueof AsyncAPISolaceServerBinding);
```

| Field        | Type     | Required |
| ------------ | -------- | -------- |
| `msgVpn`     | `string` | no       |
| `clientName` | `string` | no       |

Apply it to the service namespace. `clientName` is at most 160 characters.

The emitted field is `msgVpn`. Version 0.2.0 of the Solace binding spells it `msvVpn`, and this library emits 0.4.0.

## `@solaceOperation`

```typespec
extern dec solaceOperation(target: Operation, config: valueof AsyncAPISolaceOperationBinding);
```

| Field          | Type        | Required |
| -------------- | ----------- | -------- |
| `destinations` | `unknown[]` | no       |
| `timeToLive`   | `int32`     | no       |
| `priority`     | `int32`     | no       |
| `dmqEligible`  | `boolean`   | no       |

Apply it to an operation that carries `@send` or `@receive`.

Each entry of `destinations` may carry a `deliveryMode` of `direct` or `persistent`. Any other value is reported and dropped from that entry, and the rest of the entry is kept. The rest of an entry is emitted as written.

`priority` is zero or more.
