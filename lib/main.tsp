import "../dist/src/tsp-index.js";

using TypeSpec.Reflection;

namespace AsyncAPI;

extern dec info(target: Namespace, info: valueof AsyncAPIInfo);
// Declares one server the application connects to. The `name` argument
// becomes the key in the emitted `servers` map.
// Repeatable: apply it more than once on the same namespace to declare
// more than one server.
// Apply it to the service namespace. The emitter reads the servers from
// that namespace only, and warns about a server on any other namespace.
// Every field is trimmed. A blank optional field counts as absent and is
// left out of the emitted document.
// `host` and `pathname` may both carry `{var}` templates. Every name used
// there needs an entry in `variables`, or the emitter reports it.
extern dec server(target: Namespace, name: valueof string, config: valueof AsyncAPIServer);
// Defines one entry of `components.securitySchemes`. The `name` argument
// becomes the key of that entry.
// Repeatable: apply it more than once to define more than one scheme.
// The schemes are collected across the whole program, not from the service
// namespace only. `components` is a document-wide registry, so a scheme
// reaches the document from any namespace.
// The `scheme` argument is one of the Security Scheme models below. The
// `type` field picks the model, and the type checker then rejects a field
// that belongs to another kind of scheme.
extern dec securityScheme(
  target: Namespace,
  name: valueof string,
  scheme: valueof AsyncAPISecurityScheme
);
// Requires one security scheme on every server of this namespace.
// The `schemeName` argument names a scheme defined by `@securityScheme`.
// Repeatable: apply it more than once to require more than one scheme.
// AsyncAPI reads the `security` array as OR. A client satisfies one of the
// listed schemes.
// The emitter always writes a `$ref` into `#/components/securitySchemes`.
// A name that no `@securityScheme` defines is reported while the document is
// built, because the scheme may be declared after this application runs.
// It applies to a namespace and to an operation. On a namespace it adds the
// scheme to every server that namespace declares. On an operation it adds
// the scheme to that operation.
// Operation security is additive. It never replaces the security of the
// server. A client satisfies the array of the server and the array of the
// operation.
extern dec useSecurity(target: Namespace | Operation, schemeName: valueof string);
// Target is unknown because externalDocs can be applied to Namespace, Model, Operation, Message, etc.
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
// Adds one tag, with its metadata, to the emitted object.
// It is named `asyncTag` and not `tag`. The built-in `@tag` lives in the
// global `TypeSpec` namespace. A second `tag` here would make `@tag`
// ambiguous for anyone who writes `using AsyncAPI;`.
// Use it where the built-in `@tag` cannot reach, or where the tag needs
// metadata. The built-in `@tag` takes a name and nothing else, and its
// target does not include `Model`. So a message, which is a model, can only
// be tagged through this decorator.
// Repeatable: apply it more than once on the same target to add more than
// one tag. The tags keep their source order.
// Target is unknown because AsyncAPI puts `tags` on many objects: `info`,
// a server, a channel, an operation, and a message.
// The built-in `@tag` and this decorator merge when they name the same tag
// on one target. The metadata given here wins, because a built-in `@tag`
// carries a name and nothing that could disagree with it.
// Two applications here that name one tag merge as well. Two applications
// that give one field of that tag two different values are reported.
extern dec asyncTag(target: unknown, name: valueof string, metadata?: valueof AsyncAPITag);
// Marks a union's schema to emit `oneOf` (mutually exclusive variants)
// instead of the default `anyOf`.
extern dec oneOf(target: Union);
// Adds one raw key/value pair to a model's or property's own emitted schema.
// Repeatable: apply it more than once on the same target to add more than
// one pair.
extern dec jsonSchemaExtension(target: Model | ModelProperty, key: valueof string, value: valueof unknown);
// Marks a model as an AsyncAPI message. The model itself is the payload.
// The target stays restricted to `Model`. A scalar payload must be wrapped
// in a model.
// `name` overrides the `components.messages` key. Without it, the key comes
// from the model's own name.
extern dec message(target: Model, name?: valueof string);
// Marks one field of a message model as a message header.
// The emitter lifts the field out of the payload schema. Every marked field
// goes into the message `headers` schema instead.
// Only a top-level field of a `@message` model is lifted. A field further
// down the payload keeps its place, and the emitter reports it.
// The field's key in the headers schema is its wire name, the same name the
// payload schema would have used. So `@encodedName` renames a header too.
extern dec header(target: ModelProperty);
// Sets the whole `headers` schema of a message from a separate model.
// Use it when the headers are a model of their own, and when they nest.
// The model must be an object type.
// Do not mix it with a field-level `@header` on the same message. The
// emitter reports that pair and emits neither.
extern dec headers(target: Model, headers: Model);
// Describes the payload of a message with a schema of another format, such
// as Avro or Protobuf. The emitter writes a Multi Format Schema Object.
// `schema` is emitted exactly as written. The emitter never reads inside it,
// so it cannot check the schema against `schemaFormat`.
// The model itself describes nothing that reaches this message. It stops
// being a root of the schema walk. So it claims no `components.schemas` key
// of its own, and neither do the models it refers to. It is not exempt from
// that walk. Another message that reaches this model, or one it refers to,
// still collects it and its properties are then emitted. So give it an empty
// body.
// The raw schema is written into the message, never into `components`. Two
// messages cannot share one raw schema yet.
// Do not mix it with a field-level `@header` on the same message. The emitter
// cannot take a field out of a schema it does not read, so it reports the
// pair and emits both halves. Use `@headers` or `@rawHeaders` instead. Both
// combine with this decorator.
// A `schemaFormat` outside the values AsyncAPI names is legal, and the
// emitter warns about it.
extern dec rawPayload(target: Model, schemaFormat: valueof string, schema: valueof unknown);
// Describes the headers of a message with a schema of another format.
// This is the third way to give a message its headers. The other two are a
// field-level `@header` and a model given to `@headers`. Use one of the
// three. The emitter reports a message that names more than one, and emits
// no `headers` at all.
// `schema` is emitted exactly as written, the same rule `@rawPayload`
// follows.
extern dec rawHeaders(target: Model, schemaFormat: valueof string, schema: valueof unknown);
// Sets the `contentType` of a message. Without it, the field is left out
// and the document-level `defaultContentType` applies.
// A field named `content-type` and marked `@header` on the same message is
// a conflict, and is reported.
// The media type must not be empty. An empty one is reported and dropped.
extern dec contentType(target: Model, contentType: valueof string);
// Sets the `correlationId` of a message.
// `location` is a runtime expression. It names where the correlation value
// sits at runtime, such as `$message.header#/correlationId`.
// The emitter checks the format of the expression only. It does not check
// that the pointer names a field the headers or payload schema declares.
extern dec correlationId(target: Model, location: valueof string, description?: valueof string);
// Adds one example to a message.
// Repeatable: apply it more than once on the same model to add more than
// one example. The examples keep their source order.
// Each example carries at least one of `headers` and `payload`. An example
// with neither is reported.
extern dec messageExample(
  target: Model,
  example: valueof MessageExampleValue,
  options?: valueof MessageExampleOptions
);

// Declares one channel on an interface or a namespace.
// The channel owns the operations declared directly inside that interface or
// namespace. A nested interface, and a namespace nested inside a namespace,
// are separate scopes and may carry a channel of their own.
// `address` is required. It may hold `{name}` expressions, and an operation
// of the channel then declares each name as a parameter.
// The address is checked while the decorator runs. A query string and a
// fragment are both rejected, because AsyncAPI expresses them with a channel
// binding instead. The scheme and the host are not checked, so a full URL is
// a legal address.
// `channelId` overrides the key of this channel in the emitted `channels`
// map. Without it, the key is the declaration name of the target.
// Apply it only once per target, and never together with `@dynamicChannel`.
extern dec channel(
  target: Interface | Namespace,
  address: valueof string,
  channelId?: valueof string
);
// Declares one channel whose address is only known at runtime.
// The emitted channel carries the literal `address: null`, which AsyncAPI
// reads as "unknown".
// This is a separate decorator, and not a `@channel` with the address left
// out, so that "the address is unknown" stays distinguishable from "the
// address was forgotten".
// Apply it only once per target, and never together with `@channel`.
extern dec dynamicChannel(target: Interface | Namespace, channelId?: valueof string);
// Limits a channel to the servers it is available on.
// Repeatable: apply it more than once on the same target to name more than
// one server. The references keep their source order.
// The emitted `servers` array holds references into the root `servers` map.
// A channel with no `@useServer` carries no `servers` field at all, which
// AsyncAPI reads as "available on every server".
// The name is not checked against the declared servers. A name that no
// `@server` declares produces a reference that resolves to nothing.
extern dec useServer(target: Interface | Namespace, name: valueof string);
// Sets the `location` of one channel address parameter.
// `location` is a runtime expression. It names where the parameter value
// sits at runtime, such as `$message.payload#/user/id`.
// The emitter checks the format of the expression only, the same rule
// `@correlationId` follows.
extern dec parameterLocation(target: ModelProperty, location: valueof string);

// Marks one operation as a message this application sends.
// The emitted operation carries `action: "send"`. AsyncAPI 3 reads the action
// from the point of view of this application.
// The operation points at the channel of the interface or namespace that
// holds it. An interface wins over the namespace around it. An operation
// whose scope carries no channel is reported and dropped.
// The parameter types name the messages this operation sends. The return type
// names the messages of its reply.
// `operationId` overrides the key of this operation in the emitted
// `operations` map. Without it, the key is the name of the operation.
// Apply it only once per operation, and never together with `@receive`.
extern dec send(target: Operation, operationId?: valueof string);
// Marks one operation as a message this application receives.
// The emitted operation carries `action: "receive"`.
// The channel rule is the one `@send` follows. The direction of the signature
// is the inverse. The return type names the messages this operation receives,
// and the parameter types name the messages of its reply.
// Apply it only once per operation, and never together with `@send`.
extern dec receive(target: Operation, operationId?: valueof string);
// Names the channel the reply of one operation travels over.
// The argument is the interface or namespace that carries the channel, not
// the id of that channel. The compiler resolves the reference, so a typo
// cannot reach the document.
// An operation with no `@replyChannel` replies over its own channel.
// The named target must carry `@channel` or `@dynamicChannel`. A target with
// no channel is reported, and the whole `reply` object is dropped.
// Apply it only once per operation.
extern dec replyChannel(target: Operation, channel: Interface | Namespace);
// Names where the address of a reply sits at runtime.
// `location` is a runtime expression, such as `$message.header#/replyTo`. The
// emitter checks the format of the expression only, the same rule
// `@correlationId` follows.
// AsyncAPI requires the address of the reply channel to be null when a reply
// address is given. So declare that channel with `@dynamicChannel`. The
// emitter reports a reply address on a channel that carries an address, and
// drops the address from the reply.
// Apply it only once per operation.
extern dec replyAddress(
  target: Operation,
  location: valueof string,
  description?: valueof string
);

// Adds one raw protocol binding to whichever object the target emits.
// This is the escape hatch. Use it for a protocol this library ships no
// decorator for, and for a field a newer binding version added.
// The config is emitted exactly as written. This decorator adds no
// `bindingVersion`, because it does not read the shape of the config.
// Target is unknown because AsyncAPI puts `bindings` on four objects: a
// server, a channel, an operation, and a message. This decorator names no
// level, so the binding lands wherever the target emits an object.
// One protocol claims one member per level per target. A second application
// of the same protocol name is reported, and so is a `@binding` that names
// the protocol a protocol-specific decorator already claimed.
extern dec binding(target: unknown, protocol: valueof string, config: valueof unknown);
// Adds the Kafka server binding to the servers of one namespace.
// Apply it to the service namespace. Every server that namespace declares
// gets its own copy. `@server` is repeatable and keyed by name, so no
// decorator target can single one server out.
extern dec kafkaServer(target: Namespace, config: valueof AsyncAPIKafkaServerBinding);
// Adds the Kafka channel binding to one channel.
// Apply it to the interface or namespace that carries `@channel` or
// `@dynamicChannel`.
extern dec kafkaChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIKafkaChannelBinding
);
// Adds the Kafka operation binding to one operation.
// Apply it to an operation that carries `@send` or `@receive`.
extern dec kafkaOperation(target: Operation, config: valueof AsyncAPIKafkaOperationBinding);
// Adds the Kafka message binding to one message.
// Apply it to a model that carries `@message`.
extern dec kafkaMessage(target: Model, config: valueof AsyncAPIKafkaMessageBinding);

// Adds the WebSocket binding to one channel.
// Apply it to the interface or namespace that carries `@channel` or
// `@dynamicChannel`. The emitted member is `ws`.
// The WebSocket binding defines no server, operation or message object. Its
// own text says those three must carry no property, so this decorator is the
// whole protocol.
extern dec websocketChannel(
  target: Interface | Namespace,
  config: valueof AsyncAPIWebSocketChannelBinding
);

// The Kafka server binding fields.
// AsyncAPI says the three schema-registry fields of the channel and message
// bindings only apply when `schemaRegistryUrl` is set here. The emitter does
// not check that rule, because it spans two objects.
model AsyncAPIKafkaServerBinding {
  schemaRegistryUrl?: string;
  schemaRegistryVendor?: string;
}

// The Kafka channel binding fields.
// `topicConfiguration` is `Record<unknown>` on purpose. AsyncAPI says that
// object may carry additional properties, and Kafka names its topic settings
// with dots, so a vendor setting such as
// `confluent.value.schema.validation` stays legal.
model AsyncAPIKafkaChannelBinding {
  topic?: string;
  partitions?: int32;
  replicas?: int32;
  topicConfiguration?: Record<unknown>;
}

// The Kafka operation binding fields.
// Both are Schema Objects. Write each one as an object literal, such as
// `#{ type: "string" }`. The emitter writes it into the document as written.
model AsyncAPIKafkaOperationBinding {
  groupId?: unknown;
  clientId?: unknown;
}

// The Kafka message binding fields.
// `key` is a Schema Object, written as an object literal.
// `schemaIdLocation` is `header` or `payload`.
model AsyncAPIKafkaMessageBinding {
  key?: unknown;
  schemaIdLocation?: string;
  schemaIdPayloadEncoding?: string;
  schemaLookupStrategy?: string;
}

// The WebSocket channel binding fields.
// `method` is `GET` or `POST`.
// `query` and `headers` are Schema Objects. Write each one as an object
// literal of type `object` with a `properties` key, such as
// `#{ type: "object", properties: #{ token: #{ type: "string" } } }`.
model AsyncAPIWebSocketChannelBinding {
  method?: string;
  query?: unknown;
  headers?: unknown;
}

model AsyncAPIInfo {
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: ContactInfo;
  license?: LicenseInfo;
}

// The metadata of one tag, without its name. The name is a separate
// argument of `@asyncTag`.
model AsyncAPITag {
  description?: string;
  externalDocs?: ExternalDocs;
}

// A link to documentation held outside this document.
model ExternalDocs {
  url: string;
  description?: string;
}

model AsyncAPIServer {
  host: string;
  protocol: string;
  protocolVersion?: string;
  pathname?: string;
  title?: string;
  summary?: string;
  description?: string;

  // The values that replace the `{var}` templates of `host` and `pathname`.
  // The key is the name written inside the braces.
  variables?: Record<AsyncAPIServerVariable>;
}

// One value that a `{var}` template of `host` or `pathname` stands for.
// Every field is optional. AsyncAPI, unlike OpenAPI 3, does not require a
// `default`.
// `enum` needs backticks because it is a TypeSpec keyword.
model AsyncAPIServerVariable {
  `enum`?: string[];
  default?: string;
  description?: string;
  examples?: string[];
}

// The security schemes AsyncAPI 3 defines, one model each.
// The models never share a field. AsyncAPI gives `apiKey` and `httpApiKey`
// an `in` field with a different value set each, and it gives `name` to
// `httpApiKey` alone. One model per kind keeps those apart, so the type
// checker rejects a field on the wrong kind of scheme.
alias AsyncAPISecurityScheme =
  | UserPasswordSecurityScheme
  | ApiKeySecurityScheme
  | X509SecurityScheme
  | SymmetricEncryptionSecurityScheme
  | AsymmetricEncryptionSecurityScheme
  | HttpApiKeySecurityScheme
  | BearerHttpSecurityScheme
  | HttpSecurityScheme
  | OAuth2SecurityScheme
  | OpenIdConnectSecurityScheme
  | PlainSecurityScheme
  | ScramSha256SecurityScheme
  | ScramSha512SecurityScheme
  | GssapiSecurityScheme;

model UserPasswordSecurityScheme {
  type: "userPassword";
  description?: string;
}

// The `in` values here are `user` and `password`. They are not the
// header/query/cookie values of `httpApiKey`. This scheme has no `name`.
model ApiKeySecurityScheme {
  type: "apiKey";
  in: "user" | "password";
  description?: string;
}

// The spelling is `X509`, with a capital X. It comes from the
// specification and is emitted unchanged.
model X509SecurityScheme {
  type: "X509";
  description?: string;
}

model SymmetricEncryptionSecurityScheme {
  type: "symmetricEncryption";
  description?: string;
}

model AsymmetricEncryptionSecurityScheme {
  type: "asymmetricEncryption";
  description?: string;
}

model HttpApiKeySecurityScheme {
  type: "httpApiKey";
  name: string;
  in: "query" | "header" | "cookie";
  description?: string;
}

// The `http` scheme, in the shape AsyncAPI gives every scheme that is not
// `bearer`. It carries no `bearerFormat`.
model HttpSecurityScheme {
  type: "http";
  scheme: string;
  description?: string;
}

// The `http` scheme, in the shape AsyncAPI gives the `bearer` scheme.
// `bearerFormat` describes a bearer token, so the specification puts the
// field on this shape alone. A validator rejects a document that carries
// `bearerFormat` next to any other `scheme`. One model per shape keeps the
// two apart, so the type checker rejects the field on the wrong scheme.
model BearerHttpSecurityScheme {
  type: "http";
  scheme: "bearer";
  bearerFormat?: string;
  description?: string;
}

model OAuth2SecurityScheme {
  type: "oauth2";
  flows: AsyncAPIOAuthFlows;

  // The scope names this scheme needs. It is a subset of the
  // `availableScopes` the flows declare.
  scopes?: string[];

  description?: string;
}

model OpenIdConnectSecurityScheme {
  type: "openIdConnect";
  openIdConnectUrl: string;
  scopes?: string[];
  description?: string;
}

model PlainSecurityScheme {
  type: "plain";
  description?: string;
}

model ScramSha256SecurityScheme {
  type: "scramSha256";
  description?: string;
}

model ScramSha512SecurityScheme {
  type: "scramSha512";
  description?: string;
}

model GssapiSecurityScheme {
  type: "gssapi";
  description?: string;
}

// The four OAuth flows, each an optional named field. AsyncAPI models this
// as an object, not as the array `@typespec/http` uses.
// Declare at least one flow. An object with no flow is reported.
// Each field takes a model of its own. AsyncAPI requires a different set of
// URLs per flow, and it also forbids the URL the flow does not use. A
// validator rejects a `tokenUrl` inside `implicit`, and an
// `authorizationUrl` inside `password` or `clientCredentials`. One model per
// flow states that, so the type checker rejects a URL the flow forbids.
model AsyncAPIOAuthFlows {
  implicit?: ImplicitOAuthFlow;
  password?: PasswordOAuthFlow;
  clientCredentials?: ClientCredentialsOAuthFlow;
  authorizationCode?: AuthorizationCodeOAuthFlow;
}

// The fields every flow shares.
// `refreshUrl` is optional on all four flows. `availableScopes` maps every
// scope the flow offers to its description. AsyncAPI renames the OpenAPI
// `scopes` field to `availableScopes`.
model OAuthFlowBase {
  refreshUrl?: string;
  availableScopes: Record<string>;
}

// The implicit flow. It uses `authorizationUrl` and forbids `tokenUrl`.
// The URL stays optional here, so the emitter reports a missing or blank
// one with a message that names the flow.
model ImplicitOAuthFlow {
  ...OAuthFlowBase;
  authorizationUrl?: string;
}

// The resource owner password flow. It uses `tokenUrl` and forbids
// `authorizationUrl`.
model PasswordOAuthFlow {
  ...OAuthFlowBase;
  tokenUrl?: string;
}

// The client credentials flow. It uses `tokenUrl` and forbids
// `authorizationUrl`.
model ClientCredentialsOAuthFlow {
  ...OAuthFlowBase;
  tokenUrl?: string;
}

// The authorization code flow. It is the only flow that uses both URLs.
model AuthorizationCodeOAuthFlow {
  ...OAuthFlowBase;
  authorizationUrl?: string;
  tokenUrl?: string;
}

// The example content of one message. Both fields hold the value the message
// carries, not a schema of it.
// `payload` is free-form. The AsyncAPI Message Example Object types it as
// `any`, so a scalar payload is legal.
// `headers` is a key/value map. The specification types it as
// `Map[string, any]`, and the official parser rejects any other shape. So the
// type here rejects it first, before the value can reach the document.
model MessageExampleValue {
  headers?: Record<unknown>;
  payload?: unknown;
}

// The metadata of one message example. The field names come from the
// AsyncAPI Message Example Object.
model MessageExampleOptions {
  name?: string;
  summary?: string;
}

model ContactInfo {
  name?: string;
  url?: string;
  email?: string;
}

model LicenseInfo {
  name: string;
  url?: string;
}
