# Servers

## `@server`

```typespec
extern dec server(target: Namespace, name: valueof string, config: valueof AsyncAPIServer);
```

Declares one server the application connects to. The `name` argument becomes the key of that server in the root `servers` map. `host` and `protocol` are required. `protocolVersion`, `pathname`, `title`, `summary`, and `description` are optional.

The decorator is repeatable. Each application adds its own entry.

```typespec
@service(#{ title: "Orders" })
@server("production", #{
  host: "kafka.example.com:9092",
  protocol: "kafka",
  protocolVersion: "3.5.0",
  title: "Production"
})
@server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
namespace Orders;
```

```yaml
servers:
  production:
    host: kafka.example.com:9092
    protocol: kafka
    protocolVersion: 3.5.0
    title: Production
  sit:
    host: kafka.sit.example.com:9092
    protocol: kafka
```

The emitter reads the servers of the service namespace only. A `@server` on any other namespace is dropped with a [`server-outside-service`](../diagnostics#server-outside-service) warning.

The servers keep the order they are written in. The order comes from the source position, not from the order the decorators run in. A stacked `@server` and an augment `@@server` therefore sort together.

Every string field is trimmed. A required field that is blank after the trim drops the server with an [`empty-server-field`](../diagnostics#empty-server-field) error. An optional field that is blank after the trim is treated as absent and stays out of the document.

A server name may only use letters, digits, `_`, and `-`. Any other name is rejected with an [`invalid-server-name`](../diagnostics#invalid-server-name) error. The name is never rewritten. Two servers that share a name raise a [`duplicate-server-name`](../diagnostics#duplicate-server-name) error, and the first one in source order is kept.

### Server variables

`host` and `pathname` may both carry `{var}` templates. The `variables` field of the config gives each name a Server Variable Object.

```typespec
model AsyncAPIServerVariable {
  `enum`?: string[];
  default?: string;
  description?: string;
  examples?: string[];
}
```

Every field is optional. AsyncAPI, unlike OpenAPI 3, does not require a `default`. Write `` `enum` `` with backticks, because `enum` is a TypeSpec keyword.

```typespec
@service(#{ title: "Orders" })
@server("broker", #{
  host: "{env}.kafka.example.com:9092",
  protocol: "kafka",
  pathname: "/{tenant}",
  variables: #{
    env: #{ default: "prod", `enum`: #["prod", "sit"], description: "The environment." },
    tenant: #{ default: "acme" }
  }
})
namespace Orders;
```

```yaml
servers:
  broker:
    host: "{env}.kafka.example.com:9092"
    protocol: kafka
    pathname: /{tenant}
    variables:
      env:
        enum:
          - prod
          - sit
        default: prod
        description: The environment.
      tenant:
        default: acme
```

The names in `host` and `pathname` are read as one set. A template with no matching entry raises an [`undeclared-server-variable`](../diagnostics#undeclared-server-variable) warning. The server is still emitted, and the template text stays as written. An entry that no template uses raises an [`unused-server-variable`](../diagnostics#unused-server-variable) warning, and the entry is still emitted. A `default` outside the `enum` of the same variable raises a [`server-variable-default-not-in-enum`](../diagnostics#server-variable-default-not-in-enum) warning. A blank entry of `enum` or of `examples` names no value, so it is dropped with a [`blank-server-variable-value`](../diagnostics#blank-server-variable-value) warning. A list left with no entry is dropped whole.

## `@useServer`

```typespec
extern dec useServer(target: Interface | Namespace, name: valueof string);
```

Limits a channel to the servers it is available on. The emitted `servers` array holds references into the root `servers` map. AsyncAPI requires a Reference Object here, so a Server Object is never inlined.

The decorator is repeatable. Each application adds one reference, and the references keep their source order.

```typespec
@service(#{ title: "Orders" })
@server("kafka-prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
@server("kafka-dr", #{ host: "kafka.dr.example.com:9092", protocol: "kafka" })
namespace Orders;

@channel("orders.created")
@useServer("kafka-prod")
@useServer("kafka-dr")
interface OrderChannel {
  publish(event: OrderCreated): void;
}
```

```yaml
channels:
  orders.created:
    address: orders.created
    servers:
      - $ref: "#/servers/kafka-prod"
      - $ref: "#/servers/kafka-dr"
```

A channel with no `@useServer` carries no `servers` field. AsyncAPI reads an absent field and an empty array alike as "available on every server", so the emitter leaves the field out.

The name is not checked against the declared servers. A name that no `@server` declares produces a reference that resolves to nothing. Two other mistakes are reported: [`duplicate-use-server`](../diagnostics#duplicate-use-server) and [`use-server-without-channel`](../diagnostics#use-server-without-channel).
