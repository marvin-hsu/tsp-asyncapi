---
title: "JMS"
description: "The JMS binding. The emitted member is `jms`, and every object carries `bindingVersion: 0.0.1`."
---

# JMS

The JMS binding. The emitted member is `jms`, and every object carries `bindingVersion: 0.0.1`.

## `@jmsServer`

```typespec
extern dec jmsServer(target: Namespace, config: valueof AsyncAPIJmsServerBinding);
```

| Field                  | Type        | Required |
| ---------------------- | ----------- | -------- |
| `jmsConnectionFactory` | `string`    | **yes**  |
| `properties`           | `unknown[]` | no       |
| `clientID`             | `string`    | no       |

Apply it to the service namespace.

`jmsConnectionFactory` is required. A binding without it is reported through `missing-binding-field` and dropped whole.

## `@jmsChannel`

```typespec
extern dec jmsChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIJmsChannelBinding
);
```

| Field             | Type     | Required |
| ----------------- | -------- | -------- |
| `destination`     | `string` | no       |
| `destinationType` | `string` | no       |

`destinationType` is `queue` or `fifo-queue`. JMS lists no `exchange`, unlike Anypoint MQ.

## `@jmsMessage`

```typespec
extern dec jmsMessage(target: Model, config: valueof AsyncAPIJmsMessageBinding);
```

| Field     | Type      | Required |
| --------- | --------- | -------- |
| `headers` | `unknown` | no       |
