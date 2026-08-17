# HTTP

The HTTP binding. The emitted member is `http`, and every object carries `bindingVersion: 0.3.0`.

## `@httpOperation`

```typespec
extern dec httpOperation(target: Operation, config: valueof AsyncAPIHttpOperationBinding);
```

| Field    | Type      | Required |
| -------- | --------- | -------- |
| `method` | `string`  | no       |
| `query`  | `unknown` | no       |

Apply it to an operation that carries `@send` or `@receive`.

`method` is one of `GET`, `PUT`, `POST`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `CONNECT` and `TRACE`.

`query` is a Schema Object of type `object` with a `properties` key. AsyncAPI states both requirements.

## `@httpMessage`

```typespec
extern dec httpMessage(target: Model, config: valueof AsyncAPIHttpMessageBinding);
```

| Field        | Type      | Required |
| ------------ | --------- | -------- |
| `headers`    | `unknown` | no       |
| `statusCode` | `int32`   | no       |

Apply it to a model that also carries `@message`.

`headers` is a Schema Object of type `object` with a `properties` key.

`statusCode` is a status code from RFC 9110, so it is between 100 and 599. AsyncAPI states that it applies only to a message named by an Operation Reply Object. The emitter does not check that rule, because it spans two objects.
