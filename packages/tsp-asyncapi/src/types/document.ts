/**
 * The objects of the AsyncAPI document, in the order the specification lists
 * them.
 *
 * These are the shapes the lower stage writes. They are not the semantic
 * model: that is `resolve/service.ts`.
 *
 * The objects the author writes directly live in `authored.ts`. A decorator
 * takes each of those as a value, so the input language depends on them.
 */

import type {
  BindingsObject,
  ExternalDocumentationObject,
  ReferenceObject,
  SchemaObject,
  MessageExampleObject,
  MultiFormatSchemaObject,
  SecuritySchemeObject,
  TagObject,
} from "tsp-asyncapi-core/types";

/**
 * AsyncAPI 3.1 Document Type Definitions.
 */

/**
 * The `x-` fields an AsyncAPI object may carry.
 *
 * The key type admits only an `x-` prefixed member, so a misspelled
 * specification field stays a type error. `@extension` fills these fields,
 * and the four objects that extend this type are the four the decorator
 * reaches.
 *
 * @public
 */
export type SpecificationExtensions = Record<`x-${string}`, unknown>;

/**
 * Represents the root of the AsyncAPI 3.1 document.
 * @public
 */
export interface AsyncAPIDocument {
  /** The version of the AsyncAPI specification. */
  asyncapi: string;
  /** Identifier of the application. */
  id?: string;
  /** Metadata about the API. */
  info: InfoObject;
  /** Default content type used across the API. */
  defaultContentType?: string;
  /** The servers the application connects to, keyed by server name. */
  servers?: Record<string, ServerObject>;
  /** The available channels and messages for the API. */
  channels?: Record<string, ChannelObject>;
  /** The operations that can be performed via the API. */
  operations?: Record<string, OperationObject>;
  /** An element to hold various schemas for the specification. */
  components?: ComponentsObject;
}

/**
 * Provides metadata about the API.
 * @public
 */
export interface InfoObject extends SpecificationExtensions {
  /** A unique and precise title of the API. */
  title: string;
  /** The version of the API document. */
  version: string;
  /** A short description of the application. */
  description?: string;
  /** A URL to the Terms of Service for the API. */
  termsOfService?: string;
  /** The contact information for the exposed API. */
  contact?: ContactObject;
  /** The license information for the exposed API. */
  license?: LicenseObject;
  /** A list of tags for API documentation control. */
  tags?: TagObject[];
  /** Additional external documentation. */
  externalDocs?: ExternalDocumentationObject | ReferenceObject;
}

/**
 * One server the application connects to.
 * @public
 */
export interface ServerObject {
  /** The host name this server runs on. It may carry a port. */
  host: string;
  /** The protocol this server supports for connection, e.g. `kafka`. */
  protocol: string;
  /** The version of the protocol, e.g. `1.0.0` for Kafka. */
  protocolVersion?: string;
  /** The path to a resource on the host. */
  pathname?: string;
  /** A human readable title for the server. */
  title?: string;
  /** A short summary of the server. */
  summary?: string;
  /** A description of the server. CommonMark is allowed. */
  description?: string;
  /**
   * The values that replace the `{var}` templates of `host` and `pathname`,
   * keyed by the name written inside the braces.
   */
  variables?: Record<string, ServerVariableObject>;
  /**
   * The security schemes a client of this server satisfies. AsyncAPI reads
   * the array as OR, so one entry is enough.
   * The emitter always writes a reference into `components.securitySchemes`.
   * The specification also allows an inline Security Scheme Object here, and
   * this emitter never writes one, so the type is narrowed to a reference.
   */
  security?: ReferenceObject[];
  /** The protocol-specific settings of this server, keyed by protocol name. */
  bindings?: BindingsObject;
  /**
   * The tags of this server, each a full Tag Object.
   * The tags come from the service namespace, the same source `security` and
   * `externalDocs` come from, so every server the namespace declares carries
   * the same set.
   */
  tags?: TagObject[];
  /** Additional external documentation for this server. */
  externalDocs?: ExternalDocumentationObject | ReferenceObject;
}

/**
 * One value that a `{var}` template of `host` or `pathname` stands for.
 * Every field is optional. AsyncAPI, unlike OpenAPI 3, does not require a
 * `default`.
 * @public
 */
export interface ServerVariableObject {
  /** The values this variable is allowed to take. */
  enum?: string[];
  /** The value used when a client supplies none. */
  default?: string;
  /** A description of the variable. CommonMark is allowed. */
  description?: string;
  /** Example values for this variable. */
  examples?: string[];
}

/**
 * Contact information for the API.
 * @public
 */
export interface ContactObject {
  /** The identifying name of the contact person/organization. */
  name?: string;
  /** The URL pointing to the contact information. */
  url?: string;
  /** The email address of the contact person/organization. */
  email?: string;
}

/**
 * License information for the API.
 * @public
 */
export interface LicenseObject {
  /** The license name used for the API. */
  name: string;
  /** A URL to the license used for the API. */
  url?: string;
}

/**
 * Describes one channel: an address plus the messages that flow over it.
 * @public
 */
export interface ChannelObject extends SpecificationExtensions {
  /**
   * The address of the channel, such as a topic name or a routing key.
   * It is `null` when the address is only known at runtime. AsyncAPI reads
   * `null` as "unknown", and this emitter emits the literal `null` rather
   * than leaving the field out. The difference matters: an operation reply
   * may only point at a channel whose address is `null`.
   */
  address: string | null;
  /** A human-friendly title for the channel. */
  title?: string;
  // AsyncAPI also defines `summary`. It is left out of this interface on
  // purpose, for the same reason `MessageObject` leaves it out. `@summary`
  // already fills `title` and `@doc` already fills `description`, so
  // TypeSpec has no third source of prose to fill it from.
  /** A longer description of the channel. CommonMark is allowed. */
  description?: string;
  /**
   * The servers this channel is available on, each a reference into the
   * root `servers` map. AsyncAPI requires a Reference Object here, so a
   * Server Object is never inlined. An absent field means every server.
   */
  servers?: ReferenceObject[];
  /**
   * The parameters of the channel address, keyed by the name each one
   * carries inside the address. The field is only present when the address
   * holds at least one `{name}` expression.
   */
  parameters?: Record<string, ParameterObject>;
  /**
   * The messages that flow over this channel, each a reference into
   * `components.messages`.
   */
  messages?: Record<string, ReferenceObject>;
  /** The protocol-specific settings of this channel, keyed by protocol name. */
  bindings?: BindingsObject;
  /** The tags of this channel, each a full Tag Object. */
  tags?: TagObject[];
  /** Additional external documentation for this channel. */
  externalDocs?: ExternalDocumentationObject | ReferenceObject;
}

/**
 * One parameter of a channel address.
 *
 * AsyncAPI 3 defines no `schema` field on this object. The five fields
 * below are the whole object, plus specification extensions. So a channel
 * parameter carries no type information, and its value is always a string.
 * Do not add a `schema` field here.
 * @public
 */
export interface ParameterObject {
  /** The values the parameter may take, when they are a limited set. */
  enum?: string[];
  /** The value to substitute when the sender supplies none. */
  default?: string;
  /** A description of the parameter. CommonMark is allowed. */
  description?: string;
  /** Example values of the parameter. */
  examples?: string[];
  /**
   * A runtime expression that names where the parameter value sits inside
   * the message, such as `$message.payload#/user/id`.
   */
  location?: string;
}

/**
 * Describes one operation this application performs.
 *
 * AsyncAPI 3 reads `action` from the point of view of this application.
 * `send` means this application produces the message, and `receive` means it
 * consumes one.
 * @public
 */
export interface OperationObject extends SpecificationExtensions {
  /** Whether this application sends or receives the message. */
  action: "send" | "receive";
  /**
   * The channel this operation runs over, as a reference into the root
   * `channels` map. AsyncAPI requires the reference to address the root map,
   * never `components.channels`.
   */
  channel: ReferenceObject;
  /** A human-friendly title for the operation. */
  title?: string;
  // AsyncAPI also defines `summary`. It is left out of this interface on
  // purpose, for the same reason `ChannelObject` leaves it out. `@summary`
  // already fills `title` and `@doc` already fills `description`, so
  // TypeSpec has no third source of prose to fill it from.
  /** A longer description of the operation. CommonMark is allowed. */
  description?: string;
  /**
   * The security schemes this operation needs, each a reference into
   * `components.securitySchemes`. They are added to what the server already
   * requires, and they never replace it. The field is absent when the
   * operation names none, because AsyncAPI reads an empty array as "this
   * operation needs no scheme".
   */
  security?: ReferenceObject[];
  /** The tags of this operation, each a full Tag Object. */
  tags?: TagObject[];
  /** Additional external documentation for this operation. */
  externalDocs?: ExternalDocumentationObject | ReferenceObject;
  /** The protocol-specific settings of this operation, keyed by protocol name. */
  bindings?: BindingsObject;
  /**
   * The messages this operation carries, each a reference into the
   * `messages` map of its channel. An absent field means every message of
   * the channel, so an empty array is never emitted.
   */
  messages?: ReferenceObject[];
  /** The reply this operation expects, for a request/reply exchange. */
  reply?: OperationReplyObject;
}

/**
 * Describes the reply of one operation.
 * @public
 */
export interface OperationReplyObject {
  /**
   * Where the reply is sent at runtime. AsyncAPI only allows this field when
   * the address of the reply channel is `null`.
   */
  address?: OperationReplyAddressObject;
  /**
   * The channel the reply travels over, as a reference into the root
   * `channels` map.
   */
  channel: ReferenceObject;
  /**
   * The reply messages, each a reference into the `messages` map of the
   * reply channel. An absent field means every message of that channel, so
   * an empty array is never emitted.
   */
  messages?: ReferenceObject[];
}

/**
 * Names where the address of a reply sits at runtime.
 * @public
 */
export interface OperationReplyAddressObject {
  /**
   * A runtime expression that names where the address sits, such as
   * `$message.header#/replyTo`.
   */
  location: string;
  /** A description of the reply address. CommonMark is allowed. */
  description?: string;
}

/**
 * Holds reusable components for the AsyncAPI document.
 *
 * The fields are declared in the order the specification lists them.
 * `lowerComponents` writes them in the same order. Every field is optional.
 * An empty one is omitted rather than emitted as an empty map.
 *
 * Five of the nineteen fields the specification defines are absent. Each one
 * is a decision, and the reasons differ.
 *
 * `operationTraits` and `messageTraits` are the `traits` feature, which this
 * emitter does not implement. A trait deduplicates the emitted document
 * rather than the source. TypeSpec already offers reuse at the source level
 * with `extends`, `is`, and spread.
 *
 * `servers` is unusable here. A Channel Object's `servers`, when present,
 * must point into the root Servers Object. It may not point into this one.
 *
 * `channels` is a choice rather than a limit. An Operation Object addresses
 * the root `channels` map and never this one, so only a channel no operation
 * refers to could live here. `resolveChannels` explains why this emitter
 * emits every declared channel at the root instead.
 *
 * `operations` has no reader. Nothing inside one document references an
 * operation, so an entry here would be text no tool resolves.
 *
 * @public
 */
export interface ComponentsObject {
  /**
   * Reusable schemas.
   *
   * A value is a Schema Object, or a Multi Format Schema Object when the
   * schema is written in another language such as Avro or Protobuf. The
   * specification allows both here, so a schema in another language can be
   * shared rather than repeated in every message that carries it.
   */
  schemas?: Record<string, MultiFormatSchemaObject | SchemaObject>;
  /** Reusable server variables, keyed by the variable name. */
  serverVariables?: Record<string, ServerVariableObject>;
  /** Reusable messages, keyed by the message name. */
  messages?: Record<string, MessageObject>;
  /** Reusable security schemes, keyed by the scheme name. */
  securitySchemes?: Record<string, SecuritySchemeObject>;
  /** Reusable channel address parameters, keyed by the parameter name. */
  parameters?: Record<string, ParameterObject>;
  /** Reusable correlation ids. */
  correlationIds?: Record<string, CorrelationIdObject>;
  /** Reusable operation replies. */
  replies?: Record<string, OperationReplyObject>;
  /** Reusable operation reply addresses. */
  replyAddresses?: Record<string, OperationReplyAddressObject>;
  /**
   * Reusable server bindings.
   *
   * The value is a whole Bindings Object. The specification offers no
   * reference alternative for one protocol member inside it, so a `$ref`
   * belongs at `bindings` and never at `bindings.<protocol>`. The same holds
   * for the three maps below.
   */
  serverBindings?: Record<string, BindingsObject>;
  /** Reusable channel bindings. */
  channelBindings?: Record<string, BindingsObject>;
  /** Reusable operation bindings. */
  operationBindings?: Record<string, BindingsObject>;
  /** Reusable message bindings. */
  messageBindings?: Record<string, BindingsObject>;
  /** Reusable tags, keyed by the tag name. */
  tags?: Record<string, TagObject>;
  /** Reusable external documentation links. */
  externalDocs?: Record<string, ExternalDocumentationObject>;
}

/**
 * Describes one message an application sends or receives.
 * @public
 */
export interface MessageObject extends SpecificationExtensions {
  /** A machine-friendly name. Defaults to the `components.messages` key. */
  name?: string;
  /** A human-friendly title. */
  title?: string;
  // AsyncAPI also defines `summary`. It is left out of this interface on
  // purpose. `@summary` already fills `title` and `@doc` already fills
  // `description`, and TypeSpec has no third source of prose. So no input
  // could ever fill it. Every other Message Object field the emitter cannot
  // fill, such as `traits`, is left out for the same reason.
  /** A longer description. CommonMark is allowed. */
  description?: string;
  /**
   * The media type of the payload. When absent, the document's
   * `defaultContentType` applies.
   */
  contentType?: string;
  /**
   * The schema of the message headers. AsyncAPI requires it to describe a
   * key/value map, so it is always an object type. A `MultiFormatSchemaObject`
   * carries headers written in another schema language.
   */
  headers?: MultiFormatSchemaObject | SchemaObject | ReferenceObject;
  /**
   * The definition of the message payload. A `MultiFormatSchemaObject`
   * carries a payload written in another schema language.
   */
  payload?: MultiFormatSchemaObject | SchemaObject | ReferenceObject;
  /** How the message relates to the one it answers or continues. */
  correlationId?: CorrelationIdObject | ReferenceObject;
  /** The protocol-specific settings of this message, keyed by protocol name. */
  bindings?: BindingsObject;
  /** The tags of this message, each a full Tag Object. */
  tags?: TagObject[];
  /** Additional external documentation for this message. */
  externalDocs?: ExternalDocumentationObject | ReferenceObject;
  /** Worked examples of this message, in source order. */
  examples?: MessageExampleObject[];
}

/**
 * Locates the correlation value inside a message.
 * @public
 */
export interface CorrelationIdObject {
  /**
   * A runtime expression that names where the value sits, such as
   * `$message.header#/correlationId`.
   */
  location: string;
  /** A description of the correlation id. CommonMark is allowed. */
  description?: string;
}
