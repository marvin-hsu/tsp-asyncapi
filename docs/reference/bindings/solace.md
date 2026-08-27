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

The emitted field is `msgVpn`. Version 0.2.0 of the Solace binding spells it `msvVpn`, and the emitter writes 0.4.0.

```typespec
@service(#{ title: "Orders" })
@server("prod", #{ host: "solace.example.com:55555", protocol: "solace" })
@solaceServer(#{ msgVpn: "orders-vpn", clientName: "orders-service" })
namespace Orders;
```

```yaml
servers:
  prod:
    host: solace.example.com:55555
    protocol: solace
    bindings:
      solace:
        msgVpn: orders-vpn
        clientName: orders-service
        bindingVersion: 0.4.0
```

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

Each entry of `destinations` may carry a `deliveryMode` of `direct` or `persistent`. Any other value is reported through `invalid-binding-field`. The field is dropped and the rest of the entry is emitted as written.

`priority` is zero or more.

```typespec
@send
@solaceOperation(#{
  destinations: #[#{ destinationType: "queue", deliveryMode: "persistent" }],
  timeToLive: 60000,
  priority: 5,
  dmqEligible: true
})
op publish(event: OrderCreated): void;
```

```yaml
operations:
  publish:
    action: send
    channel:
      $ref: "#/channels/orders-queue"
    bindings:
      solace:
        destinations:
          - deliveryMode: persistent
            destinationType: queue
        timeToLive: 60000
        priority: 5
        dmqEligible: true
        bindingVersion: 0.4.0
```
