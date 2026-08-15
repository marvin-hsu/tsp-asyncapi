/**
 * AsyncAPI 3.1 Document Type Definitions.
 */

/**
 * Represents the root of the AsyncAPI 3.1.0 document.
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
 * Describes the channels and their properties.
 * @public
 */
export type ChannelObject = Record<string, never>;

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
  messages?: Record<string, never>;
  channels?: Record<string, never>;
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
