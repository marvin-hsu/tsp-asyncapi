# Anypoint MQ

The Anypoint MQ binding. The emitted member is `anypointmq`, and every object carries `bindingVersion: 0.0.1`.

## `@anypointMqChannel`

```typespec
extern dec anypointMqChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIAnypointMqChannelBinding
);
```

| Field             | Type     | Required |
| ----------------- | -------- | -------- |
| `destination`     | `string` | no       |
| `destinationType` | `string` | no       |

`destinationType` is `exchange`, `queue` or `fifo-queue`.

## `@anypointMqMessage`

```typespec
extern dec anypointMqMessage(
  target: Model,
  config: valueof AsyncAPIAnypointMqMessageBinding
);
```

| Field     | Type      | Required |
| --------- | --------- | -------- |
| `headers` | `unknown` | no       |

`headers` is a Schema Object. Anypoint MQ states no rule about its shape, unlike the HTTP and WebSocket bindings.
