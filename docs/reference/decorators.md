# Decorators

Exact signatures of everything this library declares, plus the built-in compiler decorators the emitter reads. `import "typespec-asyncapi";` and `using AsyncAPI;` bring the library decorators into scope.

## `@info`

```typespec
extern dec info(target: Namespace, info: valueof AsyncAPIInfo);
```

Fills the AsyncAPI `info` block on the service namespace. The argument's shape:

| Field            | Type                      | Required |
| ---------------- | ------------------------- | -------- |
| `version`        | `string`                  | yes      |
| `description`    | `string`                  | no       |
| `termsOfService` | `string`                  | no       |
| `contact`        | `{ name?, url?, email? }` | no       |
| `license`        | `{ name, url? }`          | no       |

```typespec
@service(#{ title: "Order Service API" })
@info(#{
  version: "1.0.0",
  description: "Order events.",
  contact: #{ name: "API Support", email: "support@example.com" },
  license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
})
namespace Orders;
```

```yaml
info:
  title: Order Service API
  version: 1.0.0
  description: Order events.
  contact:
    name: API Support
    email: support@example.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT
```

Without `@info`, `info.version` falls back to `0.0.0`. If `@info` sets no `description`, a `@doc` (or `/** ... */` doc comment) on the namespace fills it instead.

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

The emitter reads the servers of the service namespace only. A `@server` on any other namespace is dropped with a [`server-outside-service`](./diagnostics#server-outside-service) warning.

The servers keep the order they are written in. The order comes from the source position, not from the order the decorators run in. A stacked `@server` and an augment `@@server` therefore sort together.

Every string field is trimmed. A required field that is blank after the trim drops the server with an [`empty-server-field`](./diagnostics#empty-server-field) error. An optional field that is blank after the trim is treated as absent and stays out of the document.

A server name may only use letters, digits, `_`, and `-`. Any other name is rejected with an [`invalid-server-name`](./diagnostics#invalid-server-name) error. The name is never rewritten. Two servers that share a name raise a [`duplicate-server-name`](./diagnostics#duplicate-server-name) error, and the first one in source order is kept.

## `@externalDocs`

```typespec
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
```

Attaches an external documentation link. The target is declared `unknown` because external docs can eventually attach to operations and messages too; **today the emitter only reads it from the service namespace**, emitting `info.externalDocs`:

```typespec
@externalDocs("https://example.com/docs", "Service Documentation")
namespace Orders;
```

```yaml
info:
  externalDocs:
    url: https://example.com/docs
    description: Service Documentation
```

## `@oneOf`

```typespec
extern dec oneOf(target: Union);
```

Marks a union to emit `oneOf` (exactly one variant must match) instead of the default `anyOf` (at least one). Takes effect in the [schema conversion layer](../guide/schema-conversion#unions):

```typespec
@oneOf
union Shape {
  circle: Circle,
  square: Square,
}
```

```yaml
Shape:
  oneOf:
    - $ref: "#/components/schemas/Circle"
    - $ref: "#/components/schemas/Square"
```

## `@message`

```typespec
extern dec message(target: Model, name?: valueof string);
```

Marks a model as an AsyncAPI message. Each marked model becomes an entry in `components.messages`, with its `payload` referencing the model's schema.

The target must be a `Model`. A message whose payload is a single scalar has to wrap that scalar in a model.

```typespec
@message
model OrderCreated {
  orderId: string;
  amount: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      payload:
        $ref: "#/components/schemas/OrderCreated"
  schemas:
    OrderCreated:
      type: object
      properties:
        orderId:
          type: string
        amount:
          type: number
          format: double
      required:
        - orderId
        - amount
```

The optional argument overrides the key:

```typespec
@message("order.created.v1")
model OrderCreated {
  orderId: string;
}
```

Two points worth knowing:

- **Only reachable models are emitted.** `components.schemas` holds the models a message reaches, directly or through its properties. A model no message references is left out.
- **A message key drops the namespace prefix that a schema key keeps.** A `@message model Ev` inside `namespace Sales` produces the message key `Ev` and the schema key `Sales.Ev`. When a message key happens to match a different type's schema key, the emitter reports [`message-key-shadows-schema-key`](./diagnostics#message-key-shadows-schema-key).

## `@jsonSchemaExtension`

```typespec
extern dec jsonSchemaExtension(target: Model | ModelProperty, key: valueof string, value: valueof unknown);
```

Adds one raw key/value pair to the target's emitted schema — the escape hatch for keywords with no dedicated decorator. Repeatable: each application adds one pair. An extension key overrides the same keyword the emitter would produce itself.

```typespec
@jsonSchemaExtension("unevaluatedProperties", false)
model Strict {
  id: string;
}
```

```yaml
Strict:
  type: object
  properties:
    id:
      type: string
  required:
    - id
  unevaluatedProperties: false
```

## Built-in decorators the emitter reads

These come from `@typespec/compiler` — no import needed:

| Decorator                                                                                                                                         | Effect in this emitter                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@service(#{ title })`                                                                                                                            | Marks the service namespace; `title` → `info.title`. One service per document — a second one warns ([`multiple-services`](./diagnostics#multiple-services)) and is ignored. |
| `@tag("name")`                                                                                                                                    | One `info.tags` entry per application.                                                                                                                                      |
| `@doc` / doc comments                                                                                                                             | `description` — on the namespace (fallback for `info.description`) and on every schema-layer declaration or property.                                                       |
| `@summary`                                                                                                                                        | `title` on a schema.                                                                                                                                                        |
| `@example(#{...})`                                                                                                                                | An entry in a schema's `examples`, serialized to JSON.                                                                                                                      |
| `@discriminator("prop")`                                                                                                                          | `discriminator` on the schema; see [inheritance](../guide/schema-conversion#inheritance-and-discriminators).                                                                |
| `@encodedName("application/json", "wire_name")`                                                                                                   | Renames the schema property key; see [wire keys](../guide/schema-conversion#renaming-wire-keys-encodedname).                                                                |
| `@friendlyName("{name}X", T)`                                                                                                                     | Overrides a declaration's `components.schemas` key.                                                                                                                         |
| `@minLength`, `@maxLength`, `@pattern`, `@format`, `@minValue`, `@maxValue`, `@minValueExclusive`, `@maxValueExclusive`, `@minItems`, `@maxItems` | Validation keywords; see the [mapping table](../guide/schema-conversion#validation-decorators).                                                                             |

::: tip
Schema-layer decorators (`@oneOf`, `@jsonSchemaExtension`, and the schema-shaping built-ins) currently take effect in the conversion layer only — see the status note in [Schema Conversion](../guide/schema-conversion).
:::
