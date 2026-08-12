/**
 * AsyncAPI 3.1 Document Type Definitions.
 */

/**
 * Represents the root of the AsyncAPI 3.1.0 document.
 * @category Types
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
  /** The available channels and messages for the API. */
  channels?: Record<string, ChannelObject>;
  /** The operations that can be performed via the API. */
  operations?: Record<string, OperationObject>;
  /** An element to hold various schemas for the specification. */
  components?: ComponentsObject;
}

/**
 * Provides metadata about the API.
 * @category Types
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
 * Contact information for the API.
 * @category Types
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
 * @category Types
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
 * @category Types
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
 * @category Types
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
 * @category Types
 * @public
 */
export type ChannelObject = Record<string, never>;

/**
 * Describes a specific operation.
 * @category Types
 * @public
 */
export type OperationObject = Record<string, never>;

/**
 * Holds reusable components for the AsyncAPI document.
 * @category Types
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
 * @category Types
 * @public
 */
export interface SchemaObject {
  type?: string | string[];
  title?: string;
  description?: string;
  format?: string;
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
  $ref?: string;
}

/**
 * A simple object to allow referencing other components in the specification.
 * @category Types
 * @public
 */
export interface ReferenceObject {
  $ref: string;
}
