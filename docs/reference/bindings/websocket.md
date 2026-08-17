# WebSocket

The WebSocket binding. The emitted member is `ws`, and every object carries `bindingVersion: 0.1.0`.

## `@websocketChannel`

```typespec
extern dec websocketChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIWebSocketChannelBinding
);
```

| Field     | Type      | Required |
| --------- | --------- | -------- |
| `method`  | `string`  | no       |
| `query`   | `unknown` | no       |
| `headers` | `unknown` | no       |

Apply it to the interface or namespace that carries `@channel` or `@dynamicChannel`.

The emitted member is `ws`. AsyncAPI names the binding folder `websockets`, and it names the member `ws`. The member name is what a reader of the document sees.

`method` is the HTTP method that opens the connection. AsyncAPI allows `GET` and `POST`. Any other value is reported through `invalid-binding-field`. The field is dropped and the rest of the binding is kept.

`query` and `headers` describe the handshake. Each one is a Schema Object. Write it as an object literal of type `object` with a `properties` key. AsyncAPI states both requirements. A schema that meets neither describes no parameter, so the emitter reports it and drops the field. A `$ref` passes without either key, because the schema behind it lives elsewhere.

The WebSocket binding has no server, operation or message object. The specification states that all three must carry no property. So `@websocketChannel` is the whole protocol.

```typespec
@websocketChannel(#{
  method: "GET",
  query: #{ type: "object", properties: #{ token: #{ type: "string" } } }
})
@channel("/ticks")
interface TickStream {
  @send
  op publish(event: Tick): void;
}
```

```yaml
channels:
  /ticks:
    address: /ticks
    bindings:
      ws:
        method: GET
        query:
          type: object
          properties:
            token:
              type: string
        bindingVersion: 0.1.0
```
