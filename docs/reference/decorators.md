# Decorators

Exact signatures of everything this library declares, plus the built-in compiler decorators the emitter reads. `import "tsp-asyncapi";` and `using AsyncAPI;` bring the library decorators into scope.

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

The names in `host` and `pathname` are read as one set. A template with no matching entry raises an [`undeclared-server-variable`](./diagnostics#undeclared-server-variable) warning. The server is still emitted, and the template text stays as written. An entry that no template uses raises an [`unused-server-variable`](./diagnostics#unused-server-variable) warning, and the entry is still emitted. A `default` outside the `enum` of the same variable raises a [`server-variable-default-not-in-enum`](./diagnostics#server-variable-default-not-in-enum) warning. A blank entry of `enum` or of `examples` names no value, so it is dropped with a [`blank-server-variable-value`](./diagnostics#blank-server-variable-value) warning. A list left with no entry is dropped whole.

## `@securityScheme`

```typespec
extern dec securityScheme(
  target: Namespace,
  name: valueof string,
  scheme: valueof AsyncAPISecurityScheme
);
```

Defines one entry of `components.securitySchemes`. The `name` argument becomes the key of that entry. The decorator is repeatable.

The schemes are collected across the whole program. `components` is a document-wide registry, so a scheme reaches the document from any namespace. This differs from `@server`, which the emitter reads from the service namespace only.

`AsyncAPISecurityScheme` is a union of one model per kind of scheme. The `type` field picks the model. The models never share a field, so the type checker rejects a field that belongs to another kind.

| `type`                                                                                                                 | Extra fields                                              |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `userPassword`, `X509`, `symmetricEncryption`, `asymmetricEncryption`, `plain`, `scramSha256`, `scramSha512`, `gssapi` | none                                                      |
| `apiKey`                                                                                                               | `in`: `"user"` or `"password"`                            |
| `httpApiKey`                                                                                                           | `name`, and `in`: `"query"`, `"header"`, or `"cookie"`    |
| `http`                                                                                                                 | `scheme`, and `bearerFormat?` when `scheme` is `"bearer"` |
| `oauth2`                                                                                                               | `flows`, `scopes?`                                        |
| `openIdConnect`                                                                                                        | `openIdConnectUrl`, `scopes?`                             |

Every scheme also takes an optional `description`. Each `type` value is emitted exactly as AsyncAPI spells it, including the capital X of `X509`.

`apiKey` and `httpApiKey` are separate models on purpose. Their `in` fields take different values, and `name` belongs to `httpApiKey` alone.

The `http` kind takes two models for the same reason. AsyncAPI describes the `bearer` scheme with an object of its own, and that object is the only one carrying `bearerFormat`. A validator rejects the field next to any other scheme, so the type checker rejects it there too.

```typespec
@service(#{ title: "Orders" })
@securityScheme("kafka-scram", #{ type: "scramSha512", description: "SASL/SCRAM over TLS." })
@securityScheme("api-key", #{ type: "httpApiKey", name: "X-Api-Key", in: "header" })
namespace Orders;
```

```yaml
components:
  securitySchemes:
    kafka-scram:
      type: scramSha512
      description: SASL/SCRAM over TLS.
    api-key:
      type: httpApiKey
      name: X-Api-Key
      in: header
```

An `oauth2` scheme carries an OAuth Flows Object. AsyncAPI models it as four optional named fields, not as an array.

```typespec
model AsyncAPIOAuthFlows {
  implicit?: ImplicitOAuthFlow;
  password?: PasswordOAuthFlow;
  clientCredentials?: ClientCredentialsOAuthFlow;
  authorizationCode?: AuthorizationCodeOAuthFlow;
}

model OAuthFlowBase {
  refreshUrl?: string;
  availableScopes: Record<string>;
}

model ImplicitOAuthFlow {
  ...OAuthFlowBase;
  authorizationUrl?: string;
}

model PasswordOAuthFlow {
  ...OAuthFlowBase;
  tokenUrl?: string;
}

model ClientCredentialsOAuthFlow {
  ...OAuthFlowBase;
  tokenUrl?: string;
}

model AuthorizationCodeOAuthFlow {
  ...OAuthFlowBase;
  authorizationUrl?: string;
  tokenUrl?: string;
}
```

Each flow takes a model of its own. AsyncAPI requires a different set of URLs per flow, and it also forbids the URL the flow does not use. A `tokenUrl` inside `implicit`, or an `authorizationUrl` inside `password` or `clientCredentials`, makes the whole scheme invalid. One model per flow states that, so the type checker rejects a URL the flow forbids.

AsyncAPI names the scope map `availableScopes`. OpenAPI calls the same map `scopes`. The `scopes` field of the scheme itself is a different thing. It lists the scope names this scheme needs, which is a subset of the `availableScopes` of the flows.

```typespec
@service(#{ title: "Orders" })
@securityScheme("oauth", #{
  type: "oauth2",
  scopes: #["orders:write"],
  flows: #{
    clientCredentials: #{
      tokenUrl: "https://example.com/token",
      availableScopes: #{ `orders:read`: "Read orders", `orders:write`: "Write orders" }
    }
  }
})
namespace Orders;
```

```yaml
components:
  securitySchemes:
    oauth:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://example.com/token
          availableScopes:
            orders:read: Read orders
            orders:write: Write orders
      scopes:
        - orders:write
```

`implicit` and `authorizationCode` need an `authorizationUrl`. `password`, `clientCredentials`, and `authorizationCode` need a `tokenUrl`. A missing or blank one raises a [`missing-oauth-flow-url`](./diagnostics#missing-oauth-flow-url) error, and the scheme is dropped. A `flows` object with no flow raises an [`empty-oauth-flows`](./diagnostics#empty-oauth-flows) error.

Every URL of a scheme must be absolute. This covers `openIdConnectUrl` and the `authorizationUrl`, `tokenUrl`, and `refreshUrl` of each flow. AsyncAPI marks these fields with the `uri` format, so a relative one such as `/token` makes a parser reject the whole document. Such a value raises an [`invalid-url`](./diagnostics#invalid-url) error, and the scheme is dropped.

A blank entry of `scopes` names no scope, so it is dropped with a [`blank-security-scope-name`](./diagnostics#blank-security-scope-name) warning. The scheme itself survives. A blank description inside `availableScopes` is kept as an empty string, because AsyncAPI requires a value for every key of that map.

A scheme name may only use letters, digits, `.`, `-`, and `_`. Any other name raises an [`invalid-security-scheme-name`](./diagnostics#invalid-security-scheme-name) error. Two schemes that share a name raise a [`duplicate-security-scheme-name`](./diagnostics#duplicate-security-scheme-name) error, and the first one in source order is kept. A required string field that is blank raises an [`empty-security-scheme-field`](./diagnostics#empty-security-scheme-field) error.

## `@useSecurity`

```typespec
extern dec useSecurity(target: Namespace, schemeName: valueof string);
```

Requires one security scheme on every server of a namespace. The decorator is repeatable. Each application adds one entry to the `security` array of every server that namespace declares.

AsyncAPI reads that array as OR. A client satisfies one of the listed schemes, not all of them.

```typespec
@service(#{ title: "Orders" })
@securityScheme("kafka-scram", #{ type: "scramSha512" })
@useSecurity("kafka-scram")
@server("production", #{ host: "kafka.example.com:9092", protocol: "kafka-secure" })
@server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka-secure" })
namespace Orders;
```

```yaml
servers:
  production:
    host: kafka.example.com:9092
    protocol: kafka-secure
    security:
      - $ref: "#/components/securitySchemes/kafka-scram"
  sit:
    host: kafka.sit.example.com:9092
    protocol: kafka-secure
    security:
      - $ref: "#/components/securitySchemes/kafka-scram"
```

The emitted entry is always a reference into `components.securitySchemes`. AsyncAPI also allows an inline scheme there, and this emitter never writes one.

The scheme name follows the same character set as the name of a `@securityScheme`: letters, digits, `.`, `-`, and `_`. The name is written into a JSON Pointer, and a character outside that set makes the pointer malformed. Any other name raises an [`invalid-security-scheme-name`](./diagnostics#invalid-security-scheme-name) error, and the application is dropped.

The name is used exactly as written, and surrounding spaces are not removed. `@securityScheme` treats its own name the same way, so a padded name is rejected on both sides.

The name is also checked against the declared schemes. A name that no `@securityScheme` defines would become a reference to a key the document does not carry, which an AsyncAPI parser rejects. Such an entry raises an [`undeclared-security-scheme`](./diagnostics#undeclared-security-scheme) warning and is dropped. A server whose every entry is dropped carries no `security` field at all.

The `security` array sits on a server object. A `@useSecurity` on a namespace with no `@server` therefore changes nothing, and raises a [`use-security-outside-server`](./diagnostics#use-security-outside-server) warning.

## `@externalDocs`

```typespec
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
```

Attaches an external documentation link. The target is declared `unknown` because external docs attach in several places. **Today the emitter reads it from the service namespace, emitting `info.externalDocs`, and from a `@message` model, emitting that message's `externalDocs`.** Applying it elsewhere records the link but emits nothing yet.

A namespace that carries `@server` also puts the link on every server it declares. The servers come from the service namespace, and `info` reads that same namespace, so the link appears in both places. AsyncAPI defines `externalDocs` on both objects.

The `url` must be an absolute URL. AsyncAPI marks the field with the `uri` format, so a relative one such as `/docs` makes a parser reject the whole document. A url that is not absolute raises an [`invalid-url`](./diagnostics#invalid-url) error, and the whole application is dropped.

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

```typespec
@message
@externalDocs("https://example.com/order-created", "How to consume this message.")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      externalDocs:
        url: https://example.com/order-created
        description: How to consume this message.
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

## `@asyncTag`

```typespec
extern dec asyncTag(target: unknown, name: valueof string, metadata?: valueof AsyncAPITag);

model AsyncAPITag {
  description?: string;
  externalDocs?: ExternalDocs;
}

model ExternalDocs {
  url: string;
  description?: string;
}
```

Adds one tag, with its metadata, to the emitted object. Repeatable: each application adds one tag, and the emitted array follows source order.

It is named `asyncTag` and not `tag` on purpose. The built-in `@tag` lives in the global `TypeSpec` namespace, which is always in scope. A second `tag` in the `AsyncAPI` namespace would make a plain `@tag(...)` ambiguous for anyone who writes `using AsyncAPI;`, and every existing `@tag` would have to be rewritten as `@TypeSpec.tag(...)`.

Two things separate it from the built-in `@tag`:

|          | Built-in `@tag`                       | `@asyncTag`                                  |
| -------- | ------------------------------------- | -------------------------------------------- |
| Argument | A name, and nothing else              | A name plus `description` and `externalDocs` |
| Target   | `Namespace \| Interface \| Operation` | Anything, `Model` included                   |

AsyncAPI puts a full Tag Object on each item, where OpenAPI puts a bare string. And a message is a model, so **the built-in `@tag` cannot tag a message at all** — the compiler rejects the application.

```typespec
@message
@asyncTag("orders", #{
  description: "Everything about orders.",
  externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
})
@asyncTag("public")
model OrderCreated {
  id: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      tags:
        - name: orders
          description: Everything about orders.
          externalDocs:
            url: https://example.com/orders
            description: The order guide.
        - name: public
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

The emitter reads it on the service namespace (`info.tags`) and on a message. Applying it elsewhere records the tag but emits nothing yet.

The name must not be empty. `name` is required on an AsyncAPI Tag Object, and a blank one names nothing a consumer can match, so `@asyncTag("")` is reported as [`empty-tag-name`](./diagnostics#empty-tag-name) and the tag is dropped.

### Merging

One name means one Tag Object per object. Two applications that name one tag on one target merge field by field:

- **Built-in `@tag` plus `@asyncTag`, same name.** They merge, and the metadata wins. The built-in decorator carries a name and nothing that could disagree with it.
- **Two `@asyncTag`, same name, different fields.** They merge. One `description` and one `externalDocs` together make one Tag Object.
- **Two `@asyncTag`, same name, one field with two different values.** This is [`conflicting-tag-metadata`](./diagnostics#conflicting-tag-metadata), an error. The first application in source order keeps the field.

One name on **two different targets** may carry different metadata, and that is not an error. AsyncAPI gives every object its own `tags` array, and those arrays are independent.

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

## `@contentType`

```typespec
extern dec contentType(target: Model, contentType: valueof string);
```

Sets the media type of a message payload. Without it the field is left out, and the document-level `defaultContentType` applies.

```typespec
@message
@contentType("application/avro")
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      contentType: application/avro
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

The emitter passes the string through untouched. It never parses the media type or changes the payload schema because of it.

Apply the decorator once per model. A message carries one content type, so a second application is reported as [`duplicate-content-type-decorator`](./diagnostics#duplicate-content-type-decorator).

The media type must not be empty. A blank one names no format, so it is reported as [`empty-content-type`](./diagnostics#empty-content-type) and dropped. The message then falls back to the document-level `defaultContentType`.

## `@header`

```typespec
extern dec header(target: ModelProperty);
```

Marks one field of a message model as a message header. The emitter lifts every marked field out of the payload schema and collects them into the message's `headers` schema. The payload keeps the fields that carry no mark.

```typespec
@message
model OrderCreated {
  @header
  correlationId: string;

  @header
  retryCount?: int32;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
          retryCount:
            type: integer
            format: int32
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
      required:
        - orderId
```

Five points worth knowing:

- **It takes no name argument.** `@typespec/http`'s `@header` has one because HTTP renames a field to kebab-case. AsyncAPI application headers have no such convention. Use [`@encodedName`](#built-in-decorators-the-emitter-reads) to give a header a key that is not a TypeSpec identifier, the same way you rename a payload field.
- **Only a top-level field of a `@message` model is lifted.** A mark further down the payload is reported as [`nested-header-ignored`](./diagnostics#nested-header-ignored), and the field stays in the payload. Use `@headers` for a headers object with nesting of its own.
- **`extends` and `...` differ here.** A spread, `...Base`, copies the properties into the message model, so a marked property is the message's own field and it is lifted. An `extends Base` keeps the property on the base model, which the payload refers to through `allOf`. Lifting it would change every other model that extends the same base, so the emitter leaves it in place and reports [`inherited-header-ignored`](./diagnostics#inherited-header-ignored).
- **The payload gets a component of its own.** Lifting is local to the message. The model's own `components.schemas` entry keeps every field, so a subtype, another message's field, and any other reader still see the whole shape. The message points at a second component keyed `<Model>Payload`, which holds the fields that stayed. A model you already named `<Model>Payload` yourself is reported as [`duplicate-schema-key`](./diagnostics#duplicate-schema-key), and the message falls back to the model's own component.
- **A header field named `content-type` conflicts with `@contentType`.** AsyncAPI has one field for the content type, so the emitter reports [`content-type-header-conflict`](./diagnostics#content-type-header-conflict) rather than picking a source.

## `@headers`

```typespec
extern dec headers(target: Model, headers: Model);
```

Sets the whole `headers` schema of a message from a separate model. Use it when the headers are a model of their own, and when they nest. The emitter emits that model into `components.schemas` and references it, so several messages can share one headers definition.

```typespec
model MqmdFields {
  CorrelId: string;
}

model ShippingHeaders {
  MQMD: MqmdFields;
}

@message
@headers(ShippingHeaders)
model OrderShipped {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderShipped:
      name: OrderShipped
      headers:
        $ref: "#/components/schemas/ShippingHeaders"
      payload:
        $ref: "#/components/schemas/OrderShipped"
```

The model must be an object type. AsyncAPI requires the headers schema to describe a key/value map, so an array-backed model is reported as [`headers-not-object`](./diagnostics#headers-not-object).

Do not mix this with a field-level `@header` on the same message. Two sources for one field have no obvious winner, so the emitter reports [`duplicate-message-headers`](./diagnostics#duplicate-message-headers) and emits neither.

A `content-type` property of the headers model conflicts with `@contentType` on the message, exactly as a field-level `@header` of that name does. The emitter reports [`content-type-header-conflict`](./diagnostics#content-type-header-conflict). Inherited properties of the headers model are checked too.

## `@correlationId`

```typespec
extern dec correlationId(target: Model, location: valueof string, description?: valueof string);
```

Sets the message's `correlationId`. `location` is a runtime expression that names where the correlation value sits at runtime.

```typespec
@message
@correlationId("$message.header#/correlationId", "Ties a reply to its request.")
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
      correlationId:
        location: "$message.header#/correlationId"
        description: Ties a reply to its request.
```

A legal `location` is `$message.header#` or `$message.payload#`, each optionally followed by a JSON Pointer. Everything below is legal:

| Location                         | Meaning                           |
| -------------------------------- | --------------------------------- |
| `$message.header#`               | The headers object itself         |
| `$message.header#/correlationId` | One header                        |
| `$message.header#/MQMD/CorrelId` | A header nested two levels down   |
| `$message.payload#/order/id`     | A field nested inside the payload |

The `#` is required. The prose ABNF of the specification reads as if it were optional, but the normative JSON Schema of the specification requires it, and the official AsyncAPI parser rejects a document that carries the bare `$message.header`.

Anything else is reported as [`invalid-correlation-id-location`](./diagnostics#invalid-correlation-id-location), and no `correlationId` is emitted.

The emitter checks the format and nothing else. It does not check that the pointer names a field the headers or payload schema declares. AsyncAPI states no such requirement, and its own examples point at paths their schemas never define.

Apply the decorator once per model. A second application is reported as [`duplicate-correlation-id-decorator`](./diagnostics#duplicate-correlation-id-decorator).

## `@messageExample`

```typespec
extern dec messageExample(
  target: Model,
  example: valueof MessageExampleValue,
  options?: valueof MessageExampleOptions
);
```

Adds one worked example to a message. The argument's shape:

| Field             | Type              | Required |
| ----------------- | ----------------- | -------- |
| `example.headers` | `Record<unknown>` | no       |
| `example.payload` | `unknown`         | no       |
| `options.name`    | `string`          | no       |
| `options.summary` | `string`          | no       |

`headers` is a key/value map, because the AsyncAPI Message Example Object types it as `Map[string, any]`. `payload` is free-form, because the specification types it as `any`, so a scalar payload is legal.

Repeatable: each application adds one entry to the `examples` array, and the entries keep their source order. AsyncAPI's `examples` is an array, so one message can show several situations, each with its own `name`.

```typespec
@message
@messageExample(
  #{ headers: #{ correlationId: "abc-123" }, payload: #{ orderId: "o-1", total: 12.5 } },
  #{ name: "smallOrder", summary: "One line, already paid." }
)
@messageExample(#{ payload: #{ orderId: "o-2", total: 999.0 } }, #{ name: "largeOrder" })
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
  total: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      examples:
        - name: smallOrder
          summary: One line, already paid.
          headers:
            correlationId: abc-123
          payload:
            orderId: o-1
            total: 12.5
        - name: largeOrder
          payload:
            orderId: o-2
            total: 999
```

Two points worth knowing:

- **Every example carries at least one of `headers` and `payload`.** An example with neither shows nothing about the message, so it is reported as [`empty-message-example`](./diagnostics#empty-message-example) and dropped.
- **The content is not checked against the message schema.** The value is emitted as written. A value the emitter cannot serialize to JSON, such as a custom scalar constructor, drops that whole entry and reports [`unserializable-message-example`](./diagnostics#unserializable-message-example).

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

## `@channel`

```typespec
extern dec channel(target: Interface | Namespace, address: valueof string, channelId?: valueof string);
```

Declares one channel. The channel owns the operations declared directly inside the interface or namespace. A nested interface, and a namespace nested inside a namespace, are separate scopes. Each of them may carry a channel of its own.

`address` is required. Without `channelId`, the key in the `channels` map is the declaration name of the target.

```typespec
@service(#{ title: "Orders" })
namespace Orders;

@message
model OrderCreated {
  orderId: string;
}

@channel("orders.created")
interface OrderChannel {
  publish(event: OrderCreated): void;
}
```

```yaml
channels:
  OrderChannel:
    address: orders.created
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
```

The `messages` map comes from the operations of the channel. The emitter walks the type of each top-level operation parameter and the return type. It unwraps a union into its variants, and it unwraps the element type of an array or a record. A model that carries [`@message`](#message) becomes one entry. The walk does not go into the properties of a model, because a nested model is payload data. A channel that names no message reports [`channel-no-messages`](./diagnostics#channel-no-messages), and the `messages` field is left out.

The address is checked while the decorator runs:

- A query string reports [`invalid-channel-address`](./diagnostics#invalid-channel-address). AsyncAPI expresses query parameters with a channel binding.
- A fragment reports the same code.
- An unbalanced or nested `{}` pair reports the same code.
- A name outside `A-Z`, `a-z`, `0-9`, `-`, and `_` reports [`invalid-channel-param-name`](./diagnostics#invalid-channel-param-name).
- A blank address reports [`empty-channel-address`](./diagnostics#empty-channel-address).

The scheme and the host are not checked. A full URL, a bare path, and a plain topic name are all legal addresses.

Apply the decorator once per target. A second application reports [`duplicate-channel-decorator`](./diagnostics#duplicate-channel-decorator).

### Address parameters

An address may hold `{name}` expressions. Each name is declared by a top-level parameter of an operation the channel owns. A parameter whose type carries `@message` is a message declaration, so it never declares an address parameter.

```typespec
@channel("orders.{region}.created")
interface OrderChannel {
  publish(
    @doc("The region the order was placed in.")
    region: "eu" | "us",

    event: OrderCreated,
  ): void;
}
```

```yaml
channels:
  OrderChannel:
    address: orders.{region}.created
    parameters:
      region:
        enum:
          - eu
          - us
        description: The region the order was placed in.
    messages:
      OrderCreated:
        $ref: "#/components/messages/OrderCreated"
```

The AsyncAPI Parameter Object holds five fields and no `schema`. So a channel parameter carries no type, and its value is always a string.

| Parameter Object field | Source in TypeSpec                                                    |
| ---------------------- | --------------------------------------------------------------------- |
| `enum`                 | A string literal, a union of string literals, or a string-backed enum |
| `default`              | The default value of the parameter                                    |
| `description`          | `@doc`                                                                |
| `examples`             | `@example`                                                            |
| `location`             | [`@parameterLocation`](#parameterlocation)                            |

The `parameters` field is emitted only when the address holds at least one expression. Five mistakes are reported here: [`missing-channel-param`](./diagnostics#missing-channel-param), [`unused-channel-param`](./diagnostics#unused-channel-param), [`non-string-channel-param`](./diagnostics#non-string-channel-param), [`optional-channel-param`](./diagnostics#optional-channel-param), and [`conflicting-channel-param`](./diagnostics#conflicting-channel-param).

### Descriptive fields

A channel takes the same descriptive decorators every other object takes. `@summary` fills `title`, and `@doc` fills `description`. `@tag` and [`@asyncTag`](#asynctag) fill `tags`, and they merge the same way they merge on a message. [`@externalDocs`](#externaldocs) fills `externalDocs`.

AsyncAPI also defines `summary` on a channel. TypeSpec has no third source of prose, so the emitter never fills that field.

## `@dynamicChannel`

```typespec
extern dec dynamicChannel(target: Interface | Namespace, channelId?: valueof string);
```

Declares one channel whose address is only known at runtime. The emitted channel carries the literal `address: null`, which AsyncAPI reads as "unknown".

```typespec
@message
model OrderAccepted {
  orderId: string;
}

@dynamicChannel("replies")
interface ReplyChannel {
  receive(response: OrderAccepted): void;
}
```

```yaml
channels:
  replies:
    address: null
    messages:
      OrderAccepted:
        $ref: "#/components/messages/OrderAccepted"
```

This is a separate decorator, and not a `@channel` with the address left out. A channel with an unknown address is a different kind of channel. Keeping the two decorators apart means "the address is unknown" stays distinguishable from "the address was forgotten".

A dynamic channel never carries `parameters`, because it has no address to put an expression in. Everything else works as it works on `@channel`.

Apply the decorator once per target, and never together with `@channel`. The two mistakes report [`duplicate-dynamic-channel-decorator`](./diagnostics#duplicate-dynamic-channel-decorator) and [`conflicting-channel-decorators`](./diagnostics#conflicting-channel-decorators).

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
  OrderChannel:
    address: orders.created
    servers:
      - $ref: "#/servers/kafka-prod"
      - $ref: "#/servers/kafka-dr"
```

A channel with no `@useServer` carries no `servers` field. AsyncAPI reads an absent field and an empty array alike as "available on every server", so the emitter leaves the field out.

The name is not checked against the declared servers. A name that no `@server` declares produces a reference that resolves to nothing. Two other mistakes are reported: [`duplicate-use-server`](./diagnostics#duplicate-use-server) and [`use-server-without-channel`](./diagnostics#use-server-without-channel).

## `@parameterLocation`

```typespec
extern dec parameterLocation(target: ModelProperty, location: valueof string);
```

Sets the `location` of one channel address parameter. The value is a runtime expression. It names where the parameter value sits inside the message at runtime.

```typespec
@channel("users.{userId}.signedup")
interface UserChannel {
  publish(
    @parameterLocation("$message.payload#/user/id")
    userId: string,

    event: UserSignedUp,
  ): void;
}
```

```yaml
channels:
  UserChannel:
    address: users.{userId}.signedup
    parameters:
      userId:
        location: $message.payload#/user/id
```

The expression follows the grammar [`@correlationId`](#correlationid) follows. It starts with `$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The emitter checks the format only. It does not check that the pointer names a field the payload or the headers schema declares. An expression outside the grammar reports [`invalid-parameter-location`](./diagnostics#invalid-parameter-location).

Apply the decorator once per property. A second application reports [`duplicate-parameter-location-decorator`](./diagnostics#duplicate-parameter-location-decorator).

## Built-in decorators the emitter reads

These come from `@typespec/compiler` — no import needed:

| Decorator                                                                                                                                         | Effect in this emitter                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@service(#{ title })`                                                                                                                            | Marks the service namespace; `title` → `info.title`. One service per document — a second one warns ([`multiple-services`](./diagnostics#multiple-services)) and is ignored. |
| `@tag("name")`                                                                                                                                    | One `info.tags` entry per application. It cannot target a `Model`, so a message is tagged with [`@asyncTag`](#asynctag) instead. The two merge when they name one tag.      |
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
