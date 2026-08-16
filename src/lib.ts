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
    "payload-schema-key-taken": {
      severity: "error",
      messages: {
        default: paramMessage`Schema key '${"name"}' is claimed twice. Message '${"message"}' lifts @header fields into its \`headers\`, so its payload needs a schema of its own, and that schema is keyed after the message model. Rename the other type that claims '${"name"}', or describe the headers of '${"message"}' with @headers so its payload keeps every field.`,
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
    "inherited-header-overridden": {
      severity: "warning",
      messages: {
        default: paramMessage`The field '${"field"}' is lifted into the \`headers\` of message '${"base"}'. Message '${"message"}' extends '${"base"}' and describes its own headers with @headers, so the lift is cancelled and the field stays in the payload of '${"message"}'. The same field is then a header of '${"base"}' and payload data of '${"message"}'. Add the field to the @headers model of '${"message"}', or drop that @headers so '${"message"}' inherits the header.`,
      },
    },
    "discriminated-lifted-header": {
      severity: "error",
      messages: {
        default: paramMessage`The message model '${"name"}' lifts @header fields into its \`headers\` and also carries @discriminator. The discriminator names the subtype schemas, and those describe the lifted fields as payload data, so no payload could satisfy the message. The emitter leaves the discriminator off the payload schema. Describe the headers of '${"name"}' with @headers instead, so its payload keeps every field.`,
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
    "empty-channel-address": {
      severity: "error",
      messages: {
        default:
          "@channel was given a blank address. A blank address names no topic, path, or routing key, so it cannot reach the emitted document. This channel was dropped. Give it an address, such as 'orders.created', or use @dynamicChannel when the address is only known at runtime.",
      },
    },
    "invalid-channel-address": {
      severity: "error",
      messages: {
        // Every diagnostic here carries a `default` message, including this
        // one, which never reports under that id. The report type of the
        // library is derived from the message ids every code shares. A code
        // without a `default` leaves that shared set empty, and the derived
        // type then demands a `format` argument from codes that take none.
        default: paramMessage`The channel address '${"address"}' cannot be used. This channel was dropped.`,
        query: paramMessage`The channel address '${"address"}' carries a query string. AsyncAPI states that a channel address must not use query parameters, and that a channel binding describes them instead. This channel was dropped. Move everything after the '?' into a channel binding.`,
        fragment: paramMessage`The channel address '${"address"}' carries a fragment. AsyncAPI states that a channel address must not use a fragment, and that a channel binding describes one instead. This channel was dropped. Move everything after the '#' into a channel binding.`,
        unbalanced: paramMessage`The channel address '${"address"}' has an unbalanced or nested '{}' pair. A Channel Address Expression is a bare '{name}', and it does not nest. This channel was dropped.`,
      },
    },
    "invalid-channel-param-name": {
      severity: "error",
      messages: {
        default: paramMessage`'${"name"}' is not a legal channel address parameter name. Only the characters a-z, A-Z, 0-9, '-', and '_' are allowed, because the name is also the key of that parameter in the emitted \`parameters\` map and the name of the TypeSpec property that declares it. This channel was dropped.`,
      },
    },
    "empty-channel-id": {
      severity: "error",
      messages: {
        default:
          "The channel id given to this decorator is blank. The id is the key of this channel in the emitted `channels` map, and a blank key names nothing. This channel was dropped. Give it an id, or leave the argument out so the interface or namespace name is used.",
      },
    },
    "duplicate-channel-decorator": {
      severity: "error",
      messages: {
        default:
          "@channel is applied to this interface or namespace more than once. A channel carries one address, so only one application takes effect and the rest are discarded. Remove the extra @channel.",
      },
    },
    "duplicate-dynamic-channel-decorator": {
      severity: "error",
      messages: {
        default:
          "@dynamicChannel is applied to this interface or namespace more than once. Only one application takes effect, and the rest are discarded. Remove the extra @dynamicChannel.",
      },
    },
    "conflicting-channel-decorators": {
      severity: "error",
      messages: {
        default:
          "@channel and @dynamicChannel are both applied to this interface or namespace. One states an address and the other states that the address is unknown, and no rule picks a winner, so no channel was emitted at all. Keep one of the two.",
      },
    },
    "duplicate-channel-id": {
      severity: "error",
      messages: {
        default: paramMessage`Duplicate channel id: '${"id"}'. Each channel needs its own id, because the id is the key of that channel in the emitted document. This channel was dropped, and the first one with this id in source order was kept. Pass an explicit id to @channel on one of them.`,
      },
    },
    "channel-no-messages": {
      severity: "warning",
      messages: {
        default: paramMessage`Channel '${"id"}' has no recognizable messages. Did you forget to annotate the payload models with '@message'? The channel was emitted without a \`messages\` map.`,
      },
    },
    "missing-channel-param": {
      severity: "error",
      messages: {
        default: paramMessage`The channel address uses '{${"name"}}', but no operation in this channel declares a parameter with that name. AsyncAPI requires the \`parameters\` map to cover every expression in the address. Add a '${"name"}' parameter to an operation of this channel, or take the expression out of the address.`,
      },
    },
    "unused-channel-param": {
      severity: "error",
      messages: {
        default: paramMessage`The parameter '${"name"}' is not used by the address of channel '${"id"}'. An operation parameter whose type is not a @message model describes a channel address parameter, and this emitter never rewrites the address to absorb one. Add '{${"name"}}' to the address, or mark the parameter type with @message.`,
      },
    },
    "non-string-channel-param": {
      severity: "error",
      messages: {
        default: paramMessage`The channel parameter '${"name"}' is not declared as a string. The AsyncAPI Parameter Object has no \`schema\` field, so a channel parameter carries no type and its value is always a string. Declare it as a string, a string literal, a union of string literals, or a string-backed enum.`,
      },
    },
    "optional-channel-param": {
      severity: "error",
      messages: {
        default: paramMessage`The channel parameter '${"name"}' is optional. A Channel Address Expression is a bare '{name}' with no operator, so a separator next to it cannot disappear along with the value, whatever the position in the address. Make the parameter required, and give the Parameter Object a \`default\` through a TypeSpec default value if it usually carries one value.`,
      },
    },
    "conflicting-channel-param": {
      severity: "error",
      messages: {
        default: paramMessage`The channel parameter '${"name"}' is declared more than once in channel '${"id"}', with a different '${"field"}'. AsyncAPI emits one Parameter Object per name on a channel, so only one of the two values can be kept. The first one in source order was kept. Give the two declarations the same type, default, documentation, examples, and location.`,
      },
    },
    "duplicate-parameter-location-decorator": {
      severity: "error",
      messages: {
        default:
          "@parameterLocation is applied to this property more than once. A channel parameter carries one location, so only one application takes effect and the rest are discarded. Remove the extra @parameterLocation.",
      },
    },
    "invalid-parameter-location": {
      severity: "error",
      messages: {
        default: paramMessage`'${"location"}' is not a legal channel parameter location, so no \`location\` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.payload#/user/id'.`,
      },
    },
    "duplicate-use-server": {
      severity: "warning",
      messages: {
        default: paramMessage`@useServer names the server '${"name"}' more than once on this channel. AsyncAPI requires the entries of a channel's \`servers\` array to be unique, so one reference was emitted. Remove the extra @useServer.`,
      },
    },
    "use-server-without-channel": {
      severity: "warning",
      messages: {
        default: paramMessage`@useServer names the server '${"name"}', but this interface or namespace carries neither @channel nor @dynamicChannel. Only a channel has a \`servers\` field, so this @useServer reaches no part of the document. Add @channel, or remove this @useServer.`,
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
