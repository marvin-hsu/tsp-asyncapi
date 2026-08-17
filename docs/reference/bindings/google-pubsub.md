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

`labels` is an open map. Pub/Sub puts no rule on its keys or values, so it is emitted as written.

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

Apply it to a model that also carries `@message`. No field is required.

`schema` is optional, but a `schema` written without a `name` names no schema, so it is reported and dropped.
