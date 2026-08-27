---
title: "Security"
description: "Defines one entry of `components.securitySchemes`. The `name` argument becomes the key of that entry. The decorator is repeatable."
---

# Security

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

`implicit` and `authorizationCode` need an `authorizationUrl`. `password`, `clientCredentials`, and `authorizationCode` need a `tokenUrl`. A missing or blank one reports a [`missing-oauth-flow-url`](../diagnostics#missing-oauth-flow-url) error, and the scheme is dropped. A `flows` object with no flow reports an [`empty-oauth-flows`](../diagnostics#empty-oauth-flows) error.

Every URL of a scheme must be absolute. This covers `openIdConnectUrl` and the `authorizationUrl`, `tokenUrl`, and `refreshUrl` of each flow. AsyncAPI marks these fields with the `uri` format, so a relative one such as `/token` makes a parser reject the whole document. Such a value reports an [`invalid-url`](../diagnostics#invalid-url) error, and the scheme is dropped.

A blank entry of `scopes` reports a [`blank-security-scope-name`](../diagnostics#blank-security-scope-name) warning and is dropped. The scheme itself survives. A blank description inside `availableScopes` is kept as an empty string, because AsyncAPI requires a value for every key of that map.

A scheme name may only use letters, digits, `.`, `-`, and `_`. Any other name reports an [`invalid-security-scheme-name`](../diagnostics#invalid-security-scheme-name) error. Two schemes that share a name report a [`duplicate-security-scheme-name`](../diagnostics#duplicate-security-scheme-name) error, and the first one in source order is kept. A required string field that is blank reports an [`empty-security-scheme-field`](../diagnostics#empty-security-scheme-field) error.

## `@useSecurity`

```typespec
extern dec useSecurity(target: Namespace | Operation, schemeName: valueof string);
```

Requires one security scheme. The decorator is repeatable. Each application on a namespace adds one entry to the `security` array of every server that namespace declares. Each application on an operation adds one entry to the `security` array of that operation.

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

The emitted entry is always a reference into `components.securitySchemes`. AsyncAPI also allows an inline scheme there, and the emitter never writes one.

The scheme name follows the same character set as the name of a `@securityScheme`: letters, digits, `.`, `-`, and `_`. The name is written into a JSON Pointer, and a character outside that set makes the pointer malformed. Any other name reports an [`invalid-security-scheme-name`](../diagnostics#invalid-security-scheme-name) error, and the application is dropped.

The name is used exactly as written, and surrounding spaces are not removed. `@securityScheme` treats its own name the same way, so a padded name is rejected on both sides.

The name is also checked against the declared schemes. A name that no `@securityScheme` defines would become a reference to a key the document does not carry, which an AsyncAPI parser rejects. Such an entry reports an [`undeclared-security-scheme`](../diagnostics#undeclared-security-scheme) warning and is dropped. A server whose every entry is dropped carries no `security` field at all.

Operation security is additive. The emitter never copies the server schemes into the operation array, so a client must satisfy both.

```typespec
@channel("orders.created")
interface OrderChannel {
  @send
  @useSecurity("op-token")
  op sendOrderCreated(event: OrderCreated): void;
}
```

```yaml
operations:
  sendOrderCreated:
    action: send
    channel:
      $ref: "#/channels/orders.created"
    security:
      - $ref: "#/components/securitySchemes/op-token"
```

An operation that names no scheme carries no `security` field at all. AsyncAPI reads an empty array as "this operation needs no scheme", so the emitter never writes one.

On a namespace, the `security` array sits on a server object. A `@useSecurity` on a namespace with no `@server` therefore changes nothing, and reports a [`use-security-outside-server`](../diagnostics#use-security-outside-server) warning. That check is about namespaces only. An operation carries its own array, so it is never reported by it.
