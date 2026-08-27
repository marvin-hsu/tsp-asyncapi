---
title: "Google Cloud Pub/Sub"
description: "The Google Cloud Pub/Sub binding. The emitted member is `googlepubsub`, and every object carries `bindingVersion: 0.2.0`."
---

# Google Cloud Pub/Sub

The Google Cloud Pub/Sub binding. The emitted member is `googlepubsub`, and every object carries `bindingVersion: 0.2.0`.

## `@googlePubSubChannel`

```typespec
extern dec googlePubSubChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIGooglePubSubChannelBinding
);
```

| Field                      | Type                                 | Required |
| -------------------------- | ------------------------------------ | -------- |
| `schemaSettings`           | `AsyncAPIGooglePubSubSchemaSettings` | **yes**  |
| `labels`                   | `Record<unknown>`                    | no       |
| `messageRetentionDuration` | `string`                             | no       |
| `messageStoragePolicy`     | `AsyncAPIGooglePubSubStoragePolicy`  | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

`schemaSettings` is required, and it requires an `encoding` and a `name` of its own. A binding without them is reported through `missing-binding-field` and dropped whole.

`labels` is an open map. Pub/Sub states no rule for its keys or values, so it is emitted as written.

```typespec
@googlePubSubChannel(#{
  schemaSettings: #{ encoding: "json", name: "projects/p/schemas/order" },
  messageRetentionDuration: "604800s",
  labels: #{ team: "orders" }
})
@channel("projects/p/topics/orders")
interface OrderChannel {}
```

```yaml
channels:
  projects/p/topics/orders:
    address: projects/p/topics/orders
    bindings:
      googlepubsub:
        schemaSettings:
          encoding: json
          name: projects/p/schemas/order
        labels:
          team: orders
        messageRetentionDuration: 604800s
        bindingVersion: 0.2.0
```

## `@googlePubSubMessage`

```typespec
extern dec googlePubSubMessage(
  target: Model,
  config: valueof AsyncAPIGooglePubSubMessageBinding
);
```

| Field         | Type                         | Required |
| ------------- | ---------------------------- | -------- |
| `attributes`  | `Record<unknown>`            | no       |
| `orderingKey` | `string`                     | no       |
| `schema`      | `AsyncAPIGooglePubSubSchema` | no       |

Apply it to a model that also carries `@message`.

`schema` is optional, but a `schema` written without a `name` names no schema. It is reported through `missing-binding-field`, and the binding is dropped whole.

```typespec
@message
@googlePubSubMessage(#{
  orderingKey: "tenantId",
  attributes: #{ region: "asia-east1" },
  schema: #{ name: "projects/p/schemas/order" }
})
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      payload:
        $ref: "#/components/schemas/OrderCreated"
      bindings:
        googlepubsub:
          attributes:
            region: asia-east1
          orderingKey: tenantId
          schema:
            name: projects/p/schemas/order
          bindingVersion: 0.2.0
```
