/**
 * The document objects the author writes directly.
 *
 * Every other object in this folder is something the emitter assembles. These
 * eight are different. A decorator takes each one as a value, so the author
 * writes the object itself and the emitter passes it through.
 *
 * That is why they sit in their own file. A decorator declares its argument in
 * terms of the object it produces, so `decorators/` and `resolve/` both depend
 * on these types. The rest of the document tree is written by `lower/` alone.
 *
 * The boundary matters beyond this folder. The input language and the output
 * document are meant to be separable, and these are the types both halves
 * need. Keep a type here only while a decorator or the resolve stage refers to
 * it.
 */

/**
 * Metadata for a specific tag.
 * @public
 */
export interface TagObject {
  name: string;
  description?: string;
  externalDocs?: ExternalDocumentationObject;
}

/**
 * Allows referencing an external resource for extended documentation.
 * @public
 */
export interface ExternalDocumentationObject {
  url: string;
  description?: string;
}

/**
 * The name of one kind of security scheme.
 * Every value is the spelling AsyncAPI 3 uses. The emitter writes it
 * unchanged, so the case of each value is part of the contract.
 * @public
 */
export type SecuritySchemeType =
  | "userPassword"
  | "apiKey"
  | "X509"
  | "symmetricEncryption"
  | "asymmetricEncryption"
  | "httpApiKey"
  | "http"
  | "oauth2"
  | "openIdConnect"
  | "plain"
  | "scramSha256"
  | "scramSha512"
  | "gssapi";

/**
 * One security scheme a server or an operation requires.
 * Which fields apply depends on `type`. The decorator accepts one model per
 * kind of scheme, so a field of another kind never reaches this object.
 * @public
 */
export interface SecuritySchemeObject {
  type: SecuritySchemeType;
  /** A description of the scheme. CommonMark is allowed. */
  description?: string;
  /** The parameter name. It belongs to `httpApiKey` alone. */
  name?: string;
  /**
   * Where the key travels. `apiKey` uses `user` or `password`.
   * `httpApiKey` uses `query`, `header`, or `cookie`.
   */
  in?: string;
  /** The RFC 7235 authorization scheme, such as `basic`. For `http`. */
  scheme?: string;
  /** A hint about the bearer token format, such as `JWT`. For `http`. */
  bearerFormat?: string;
  /** The OAuth flows this scheme offers. For `oauth2`. */
  flows?: OAuthFlowsObject;
  /** The OpenID Connect discovery URL. For `openIdConnect`. */
  openIdConnectUrl?: string;
  /**
   * The scope names this scheme needs. It is a subset of the
   * `availableScopes` of the flows.
   */
  scopes?: string[];
}

/**
 * The OAuth flows of an `oauth2` scheme.
 * AsyncAPI models this as an object with four named fields, not as the
 * array `@typespec/http` uses.
 * @public
 */
export interface OAuthFlowsObject {
  implicit?: OAuthFlowObject;
  password?: OAuthFlowObject;
  clientCredentials?: OAuthFlowObject;
  authorizationCode?: OAuthFlowObject;
}

/**
 * One OAuth flow.
 * `implicit` and `authorizationCode` need `authorizationUrl`. `password`,
 * `clientCredentials`, and `authorizationCode` need `tokenUrl`.
 * @public
 */
export interface OAuthFlowObject {
  /** The authorization URL. It must be absolute. */
  authorizationUrl?: string;
  /** The token URL. It must be absolute. */
  tokenUrl?: string;
  /** The refresh URL. It must be absolute. */
  refreshUrl?: string;
  /**
   * Every scope this flow offers, mapped to its description. AsyncAPI
   * renames the OpenAPI `scopes` field to `availableScopes`.
   */
  availableScopes: Record<string, string>;
}

/**
 * A schema written in a language other than the AsyncAPI Schema Object.
 *
 * AsyncAPI calls this the Multi Format Schema Object. It carries the name of
 * the format and the definition itself. The definition is emitted exactly as
 * the author wrote it. The emitter never reads inside it, so it cannot check
 * the definition against the format.
 *
 * Both `payload` and `headers` of a Message Object accept this object.
 * @public
 */
export interface MultiFormatSchemaObject {
  /**
   * The format of `schema`, such as
   * `application/vnd.apache.avro;version=1.9.0`.
   */
  schemaFormat: string;
  /** The schema definition, in the language `schemaFormat` names. */
  schema: unknown;
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
  headers?: unknown;
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
  /**
   * Marks the value as deprecated (`#deprecated`). JSON Schema draft-07
   * onwards defines this as an annotation. It never changes whether a value
   * validates. It only tells a reader to stop using the value.
   */
  deprecated?: boolean;
  /**
   * Additional external documentation for this schema (`@externalDocs`).
   * AsyncAPI's Schema Object defines this alongside `discriminator` and
   * `deprecated` as one of the three fields it adds on top of JSON Schema
   * draft-07.
   */
  externalDocs?: ExternalDocumentationObject;
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
