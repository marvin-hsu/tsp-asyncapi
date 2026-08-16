/**
 * AsyncAPI 3.1 Document Type Definitions.
 */

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
export interface InfoObject {
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
  externalDocs?: ExternalDocumentationObject;
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
 * Metadata for a specific tag.
 * @public
 */
export interface TagObject {
  /** The name of the tag. */
  name: string;
  /** A short description for the tag. */
  description?: string;
  /** Additional external documentation for this tag. */
  externalDocs?: ExternalDocumentationObject;
}

/**
 * Allows referencing an external resource for extended documentation.
 * @public
 */
export interface ExternalDocumentationObject {
  /** The URL for the target documentation. */
  url: string;
  /** A short description of the target documentation. */
  description?: string;
}

/**
 * Describes one channel: an address plus the messages that flow over it.
 * @public
 */
export interface ChannelObject {
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
  /** The tags of this channel, each a full Tag Object. */
  tags?: TagObject[];
  /** Additional external documentation for this channel. */
  externalDocs?: ExternalDocumentationObject;
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
 * Describes a specific operation.
 * @public
 */
export type OperationObject = Record<string, never>;

/**
 * Holds reusable components for the AsyncAPI document.
 * @public
 */
export interface ComponentsObject {
  /** Reusable schemas. */
  schemas?: Record<string, SchemaObject>;
  /** Reusable messages, keyed by the message name. */
  messages?: Record<string, MessageObject>;
  channels?: Record<string, never>;
}

/**
 * Describes one message an application sends or receives.
 * @public
 */
export interface MessageObject {
  /** A machine-friendly name. Defaults to the `components.messages` key. */
  name?: string;
  /** A human-friendly title. */
  title?: string;
  // AsyncAPI also defines `summary`. It is left out of this interface on
  // purpose. `@summary` already fills `title` and `@doc` already fills
  // `description`, and TypeSpec has no third source of prose. So no input
  // could ever fill it. Every other Message Object field the emitter cannot
  // fill, such as `traits` and `schemaFormat`, is left out for the same
  // reason.
  /** A longer description. CommonMark is allowed. */
  description?: string;
  /**
   * The media type of the payload. When absent, the document's
   * `defaultContentType` applies.
   */
  contentType?: string;
  /**
   * The schema of the message headers. AsyncAPI requires it to describe a
   * key/value map, so it is always an object type.
   */
  headers?: SchemaObject | ReferenceObject;
  /** The definition of the message payload. */
  payload?: SchemaObject | ReferenceObject;
  /** How the message relates to the one it answers or continues. */
  correlationId?: CorrelationIdObject;
  /** The tags of this message, each a full Tag Object. */
  tags?: TagObject[];
  /** Additional external documentation for this message. */
  externalDocs?: ExternalDocumentationObject;
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

/**
 * One worked example of a message.
 * `headers` and `payload` hold example content, not a schema of it. Every
 * example carries at least one of the two.
 * @public
 */
export interface MessageExampleObject {
  /** A machine-friendly name for this example. */
  name?: string;
  /** A short summary of what this example shows. */
  summary?: string;
  /** Example values for the message headers. */
  headers?: unknown;
  /** An example payload. */
  payload?: unknown;
}

/**
 * AsyncAPI Schema Object, which is a superset of JSON Schema Draft 07.
 * @public
 */
export interface SchemaObject {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
  /** Minimum string length (`@minLength`). */
  minLength?: number;
  /** Maximum string length (`@maxLength`). */
  maxLength?: number;
  /** Regular expression a string must match (`@pattern`). */
  pattern?: string;
  /** Inclusive minimum numeric value (`@minValue`). */
  minimum?: number;
  /** Inclusive maximum numeric value (`@maxValue`). */
  maximum?: number;
  /** Exclusive minimum numeric value (`@minValueExclusive`). */
  exclusiveMinimum?: number;
  /** Exclusive maximum numeric value (`@maxValueExclusive`). */
  exclusiveMaximum?: number;
  /** Minimum array length (`@minItems`). */
  minItems?: number;
  /** Maximum array length (`@maxItems`). */
  maxItems?: number;
  properties?: Record<string, SchemaObject | ReferenceObject>;
  additionalProperties?: boolean | SchemaObject | ReferenceObject;
  items?: SchemaObject | ReferenceObject;
  required?: string[];
  enum?: unknown[];
  default?: unknown;
  examples?: unknown[];
  anyOf?: (SchemaObject | ReferenceObject)[];
  allOf?: (SchemaObject | ReferenceObject)[];
  oneOf?: (SchemaObject | ReferenceObject)[];
  not?: SchemaObject | ReferenceObject;
  /**
   * Name of the property used to discriminate between the schemas in a
   * polymorphic (`@discriminator`) hierarchy. OpenAPI 3.0's `Discriminator`
   * object uses `{ propertyName, mapping }`. AsyncAPI 3.x's Schema Object is
   * different. It defines `discriminator` as a bare string: the
   * discriminating property's name.
   */
  discriminator?: string;
  $ref?: string;
}

/**
 * A simple object to allow referencing other components in the specification.
 * @public
 */
export interface ReferenceObject {
  $ref: string;
}
