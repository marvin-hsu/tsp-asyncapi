# IBM MQ

The IBM MQ binding. The emitted member is `ibmmq`, and every object carries `bindingVersion: 0.1.0`.

## `@ibmMqServer`

```typespec
extern dec ibmMqServer(target: Namespace, config: valueof AsyncAPIIbmMqServerBinding);
```

| Field                  | Type      | Required |
| ---------------------- | --------- | -------- |
| `groupId`              | `string`  | no       |
| `ccdtQueueManagerName` | `string`  | no       |
| `cipherSpec`           | `string`  | no       |
| `multiEndpointServer`  | `boolean` | no       |
| `heartBeatInterval`    | `int32`   | no       |

Apply it to the service namespace.

`heartBeatInterval` is from 0 to 999999 seconds.

AsyncAPI states that `cipherSpec` applies only when the server uses TLS. The emitter does not check that, because the rule spans two objects.

## `@ibmMqChannel`

```typespec
extern dec ibmMqChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIIbmMqChannelBinding
);
```

| Field             | Type              | Required |
| ----------------- | ----------------- | -------- |
| `destinationType` | `string`          | no       |
| `queue`           | `Record<unknown>` | no       |
| `topic`           | `Record<unknown>` | no       |
| `maxMsgLength`    | `int32`           | no       |

`destinationType` is `topic` or `queue`. `maxMsgLength` is from 0 to 104857600 bytes, which is 100 MB.

AsyncAPI states that `queue` applies only when the type is `queue`, and `topic` only when it is `topic`. The emitter does not check that pairing.

## `@ibmMqMessage`

```typespec
extern dec ibmMqMessage(target: Model, config: valueof AsyncAPIIbmMqMessageBinding);
```

| Field         | Type     | Required |
| ------------- | -------- | -------- |
| `type`        | `string` | no       |
| `headers`     | `string` | no       |
| `description` | `string` | no       |
| `expiry`      | `int32`  | no       |

`type` is `string`, `jms` or `binary`. `expiry` is a number of milliseconds and is never negative. Zero means the message never expires.

`headers` is a comma-separated list of header names, not a Schema Object. IBM MQ is the one binding in this library that states the field that way.
