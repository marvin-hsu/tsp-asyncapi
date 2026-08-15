import { createTypeSpecLibrary, JSONSchemaType, paramMessage } from "@typespec/compiler";

/**
 * This package's name, as declared in `package.json` and registered with
 * the TypeSpec compiler. Other code that needs this name imports it from
 * here instead of repeating the literal string.
 *
 * @public
 */
export const LIBRARY_NAME = "tsp-asyncapi";

/**
 * Configuration options for the AsyncAPI emitter.
 *
 * @example
 * ```yaml
 * # tspconfig.yaml
 * emit:
 *   - "tsp-asyncapi"
 * options:
 *   "tsp-asyncapi":
 *     output-file: "asyncapi.yaml"
 *     file-type: "yaml"
 *     asyncapi-id: "urn:com:example:orders"
 *     default-content-type: "application/json"
 * ```
 *
 * @public
 */
export interface AsyncAPIEmitterOptions {
  /**
   * The name of the output file.
   * @defaultValue "asyncapi.yaml" or "asyncapi.json" (depending on file-type)
   */
  "output-file"?: string;

  /**
   * The format of the output file.
   * @defaultValue "yaml"
   */
  "file-type"?: "yaml" | "json";

  /**
   * The identifier of the application.
   * Maps to `id` in the AsyncAPI document.
   */
  "asyncapi-id"?: string;

  /**
   * Default content type to use when encoding/decoding a message's payload.
   * Maps to `defaultContentType` in the AsyncAPI document.
   * @example "application/json"
   */
  "default-content-type"?: string;
}

const EmitterOptionsSchema: JSONSchemaType<AsyncAPIEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    "output-file": { type: "string", nullable: true },
    "file-type": { type: "string", enum: ["yaml", "json"], nullable: true },
    "asyncapi-id": { type: "string", nullable: true },
    "default-content-type": { type: "string", nullable: true },
  },
  required: [],
};

/**
 * The TypeSpec library definition for this emitter. It registers the
 * library name, the diagnostics, and the emitter options schema with
 * the TypeSpec compiler.
 *
 * @public
 */
export const $lib = createTypeSpecLibrary({
  name: LIBRARY_NAME,
  diagnostics: {
    "multiple-services": {
      severity: "warning",
      messages: {
        default:
          "Multiple services found. AsyncAPI only supports one service per document. The first one will be used.",
      },
    },
    "unserializable-example": {
      severity: "warning",
      messages: {
        default:
          "This @example could not be serialized to JSON and was omitted from the emitted schema.",
      },
    },
    "unrepresentable-numeric-constraint": {
      severity: "warning",
      messages: {
        default: paramMessage`This @${"decorator"} constraint could not be represented as a JSON number (its value overflows or loses precision as a JS number) and was omitted from the emitted schema.`,
      },
    },
    "unsupported-temporal-range-constraint": {
      severity: "warning",
      messages: {
        default: paramMessage`This @${"decorator"} constraint targets a date/time/duration value, which draft-07 JSON Schema cannot express as a \`minimum\`/\`maximum\`, and was omitted from the emitted schema.`,
      },
    },
    "missing-discriminator-property": {
      severity: "warning",
      messages: {
        default: paramMessage`@discriminator("${"property"}") names a property that is not defined on this model. AsyncAPI requires the discriminating property to be defined here, so \`discriminator\` was omitted from the emitted schema.`,
      },
    },
    "optional-discriminator-property": {
      severity: "warning",
      messages: {
        default: paramMessage`@discriminator("${"property"}") names a property that is optional on this model. AsyncAPI requires the discriminating property to be required, so \`discriminator\` was omitted from the emitted schema.`,
      },
    },
    "encoded-name-override-conflict": {
      severity: "warning",
      messages: {
        default: paramMessage`Property "${"property"}" ${"reason"} Keeping the inherited schema as a separate \`allOf\`/\`$ref\` branch would require both properties' schemas on the same wire name at once, rejecting every valid payload — so this model's schema was flattened (inherited properties inlined) instead.`,
      },
    },
    "never-typed-property-override": {
      severity: "warning",
      messages: {
        default: paramMessage`Property "${"property"}" is declared \`never\` to remove an inherited property, but keeping the inherited schema as a separate \`allOf\`/\`$ref\` branch would still require it. This model's schema was flattened (inherited properties inlined, with the \`never\`-typed property omitted) instead.`,
      },
    },
    "duplicate-schema-key": {
      severity: "error",
      messages: {
        default: paramMessage`Duplicate schema name: '${"name"}'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.`,
      },
    },
    "duplicate-message-key": {
      severity: "error",
      messages: {
        default: paramMessage`Duplicate message name: '${"name"}'. Two @message models resolve to the same components.messages key. Pass an explicit name to @message on one of them.`,
      },
    },
    "duplicate-message-decorator": {
      severity: "error",
      messages: {
        default:
          "@message is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @message.",
      },
    },
    "message-key-shadows-schema-key": {
      severity: "warning",
      messages: {
        default: paramMessage`Message name '${"name"}' is also the components.schemas key of a different type, so a reader can misread this message as describing that type. A message key drops the namespace prefix that a schema key keeps, which makes the two overlap. Pass a different name to @message.`,
      },
    },
    "sanitized-message-key": {
      severity: "warning",
      messages: {
        default: paramMessage`Message name '${"requested"}' is not a legal components.messages key, so it was emitted as '${"emitted"}'. A key may only use the characters a-z, A-Z, 0-9, '.', '-', and '_'.`,
      },
    },
    "duplicate-content-type-decorator": {
      severity: "error",
      messages: {
        default:
          "@contentType is applied to this model more than once. A message carries one content type, so only one application takes effect and the rest are discarded. Remove the extra @contentType.",
      },
    },
    "empty-content-type": {
      severity: "error",
      messages: {
        default:
          "@contentType was given an empty media type. A blank media type names no format, so it cannot reach the emitted message. This @contentType was dropped, and the message falls back to the document defaultContentType. Give it a media type, such as 'application/json'.",
      },
    },
    "duplicate-headers-decorator": {
      severity: "error",
      messages: {
        default:
          "@headers is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @headers.",
      },
    },
    "duplicate-message-headers": {
      severity: "error",
      messages: {
        default:
          "This message takes its headers from two sources: a field marked @header, and a model given to @headers. There is no rule that picks one over the other, so no `headers` were emitted at all. Keep one of the two sources.",
      },
    },
    "headers-not-object": {
      severity: "error",
      messages: {
        default: paramMessage`The model '${"name"}' given to @headers is backed by an array. AsyncAPI requires the headers schema to be a key/value map, so no \`headers\` were emitted. Pass a model with properties instead.`,
      },
    },
    "nested-header-ignored": {
      severity: "warning",
      messages: {
        default:
          "This @header marks a property that is not a top-level field of a @message model, so it stays in the payload schema. Only a top-level field is lifted into `headers`. Move the property to the message model, or describe the whole headers object with @headers.",
      },
    },
    "inherited-header-ignored": {
      severity: "warning",
      messages: {
        default: paramMessage`This @header marks a property that '${"message"}' inherits through 'extends', so it stays in the payload schema. Only a property the message model declares itself is lifted into \`headers\`. Spread the base model with '...' instead of extending it, or describe the whole headers object with @headers.`,
      },
    },
    "shared-lifted-header": {
      severity: "warning",
      messages: {
        default: paramMessage`The message model '${"name"}' has @header fields lifted into its \`headers\`, and it is also used as a field type inside another message's payload. Both uses share one components.schemas entry, so the lifted fields are missing from the nested use as well. Give the nested use a model of its own, or move the headers of '${"name"}' into a separate model passed to @headers.`,
      },
    },
    "content-type-header-conflict": {
      severity: "error",
      messages: {
        default: paramMessage`The header '${"name"}' names the message content type, and this message also carries @contentType. AsyncAPI has one field for the content type, so two sources for it are ambiguous. Remove the @header field and keep @contentType.`,
      },
    },
    "duplicate-correlation-id-decorator": {
      severity: "error",
      messages: {
        default:
          "@correlationId is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @correlationId.",
      },
    },
    "invalid-correlation-id-location": {
      severity: "error",
      messages: {
        default: paramMessage`'${"location"}' is not a legal correlation id location, so no \`correlationId\` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/MQMD/CorrelId'.`,
      },
    },
    "empty-message-example": {
      severity: "error",
      messages: {
        default:
          "This @messageExample carries neither `headers` nor `payload`, so it shows nothing about the message. This example was dropped. Give it at least one of the two.",
      },
    },
    "unserializable-message-example": {
      severity: "warning",
      messages: {
        default:
          "This @messageExample could not be serialized to JSON and was dropped from the emitted message.",
      },
    },
    "empty-tag-name": {
      severity: "error",
      messages: {
        default:
          "@asyncTag was given an empty name. The `name` of an AsyncAPI Tag Object is required, and no consumer can match a blank one. This tag was dropped. Give it a name.",
      },
    },
    "conflicting-tag-metadata": {
      severity: "error",
      messages: {
        default: paramMessage`Tag '${"name"}' is declared more than once here, with a different '${"field"}'. AsyncAPI emits one Tag Object per name on an object, so only one of the two values can be kept. The first one in source order was kept. Merge the @asyncTag applications into one, or give them different names.`,
      },
    },
    "duplicate-server-name": {
      severity: "error",
      messages: {
        default: paramMessage`Duplicate server name: '${"name"}'. Each @server on a namespace needs its own name, because the name is the key of that server in the emitted document. This @server was dropped, and the first one with this name in source order was kept.`,
      },
    },
    "empty-server-field": {
      severity: "error",
      messages: {
        default: paramMessage`Empty server field: '${"field"}'. AsyncAPI requires a value for this field on every server. This @server was dropped.`,
      },
    },
    "server-outside-service": {
      severity: "warning",
      messages: {
        default: paramMessage`Server '${"name"}' on namespace '${"namespace"}' was dropped. This emitter reads the servers of the service namespace only. Move this @server to the service namespace this document is emitted from.`,
      },
    },
    "invalid-server-name": {
      severity: "error",
      messages: {
        default: paramMessage`Invalid server name: '${"name"}'. AsyncAPI only allows letters, digits, '_', and '-' in a server name. This @server was dropped.`,
      },
    },
    "unsupported-payload-type": {
      severity: "error",
      messages: {
        default: paramMessage`This emitter does not support a \`${"kind"}\` here. Use a model, scalar, enum, union, or literal value instead.`,
      },
    },
    "unrepresentable-circular-reference": {
      severity: "error",
      messages: {
        default:
          "This anonymous type refers back to itself with no named type in between. A plain (non-$ref) schema cannot express that cycle. Give the type a name so it can be referenced through $ref instead.",
      },
    },
  },
  emitter: {
    options: EmitterOptionsSchema,
  },
});

/**
 * Reports one of this library's diagnostics on a program.
 *
 * @public
 */
export const reportDiagnostic = $lib.reportDiagnostic.bind($lib);

/**
 * Creates one of this library's diagnostics without reporting it.
 *
 * @public
 */
export const createDiagnostic = $lib.createDiagnostic.bind($lib);
