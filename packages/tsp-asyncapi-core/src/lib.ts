import { createTypeSpecLibrary, paramMessage } from "@typespec/compiler";

/**
 * The name this library registers with the TypeSpec compiler.
 *
 * It is not this package's name. This package is `tsp-asyncapi-core`, and the
 * difference is deliberate. The name here becomes the prefix of every
 * diagnostic code, and those codes are a contract with the user. Splitting the
 * emitter into two packages is not a reason to rename them.
 *
 * Use `PACKAGE_NAME` where a package has to be named, such as when asking the
 * compiler to load this library.
 *
 * @public
 */
export const LIBRARY_NAME = "tsp-asyncapi";

/**
 * This package's name, as declared in `package.json`.
 *
 * The compiler resolves a library by package name, so this is the name a test
 * host or a `tspconfig.yaml` uses. It differs from `LIBRARY_NAME`, which is the
 * diagnostic prefix.
 *
 * @public
 */
export const PACKAGE_NAME = "tsp-asyncapi-core";

/**
 * The TypeSpec library definition. It registers the library name and every
 * diagnostic with the TypeSpec compiler.
 *
 * The name is `tsp-asyncapi`, not this package's name. That is deliberate. The
 * name becomes the prefix of every diagnostic code, and those codes are a
 * contract with the user: they appear in documentation, and a project may treat
 * one as an error. Splitting the emitter into two packages is not a reason to
 * rename them.
 *
 * Registering two libraries under one name is supported. The emitter package
 * declares a second one, for its options schema alone.
 *
 * Eighteen of these diagnostics are reported by the emitter package rather than
 * from here. They stay in this one list because a reader looking up a code
 * should find every code in one place.
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
    "visibility-not-applied": {
      severity: "warning",
      messages: {
        default:
          "@visibility does not change an AsyncAPI message. A message has one shape, not a shape per lifecycle phase, so this property is emitted in full. Use @invisible to leave a property out of the document.",
      },
    },
    "unserializable-default": {
      severity: "warning",
      messages: {
        default:
          "This property's default value could not be serialized to JSON and was omitted from the emitted schema.",
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
    "raw-schema-key-taken": {
      severity: "error",
      messages: {
        default: paramMessage`Schema key '${"name"}' is claimed twice. Message '${"message"}' carries a raw schema that another message carries too, so that schema is written once in \`components.schemas\` under a key derived from the message model. Rename the other type that claims '${"name"}', or give one of the two messages a different name.`,
      },
    },
    "preview-feature-unavailable": {
      severity: "error",
      messages: {
        default: paramMessage`The preview feature '${"feature"}' is not available in this release. It is a name this emitter reserves, and the provider behind it is not built yet. Remove '${"feature"}' from \`preview-features\` in \`tspconfig.yaml\`.`,
      },
    },
    "protobuf-artifact-unavailable": {
      severity: "error",
      messages: {
        // This code never reports under `default`, and it still carries one.
        // The report type of the library is derived from the message ids every
        // code shares. A code without a `default` leaves that shared set empty,
        // and the derived type then demands a `format` argument from codes that
        // take none.
        default: paramMessage`Model '${"name"}' has no generated Protobuf payload.`,
        "no-package": paramMessage`Model '${"name"}' carries @Protobuf.message, and no namespace above it carries @Protobuf.package. A generated payload is the proto3 text of a whole package, so the model needs one. Add @Protobuf.package to the namespace that holds this model.`,
        "not-converted": paramMessage`Model '${"name"}' of package '${"package"}' reaches ${"construct"}, and proto3 has nothing this emitter can write it as. So this message has no generated payload. Describe that part with a construct proto3 covers, or remove @Protobuf.message from the model.`,
        "unknown-scalar": paramMessage`Scalar '${"scalar"}' has no proto3 type, and no scalar it extends has one either. So model '${"name"}' of package '${"package"}' has no generated payload. Give the field a scalar that extends one of the Protobuf scalar types.`,
      },
    },
    "header-with-protobuf-field": {
      severity: "error",
      messages: {
        default: paramMessage`Property '${"name"}' of message '${"message"}' carries both @header and @Protobuf.field. A header travels beside the payload, so the generated payload leaves it out, and the field number then names a field that payload has no room for. Move the headers into their own model and point at it with @headers.`,
      },
    },
    "avro-artifact-unavailable": {
      severity: "error",
      messages: {
        default: paramMessage`Model '${"name"}' carries @Avro.record, and the Avro walk refused it: ${"reason"} So this message has no generated payload. Describe that part with a construct Avro covers, or remove @Avro.record from the model. Emitting the Avro files themselves reports every reason rather than the first.`,
      },
    },
    "avro-library-missing": {
      severity: "error",
      messages: {
        default: paramMessage`The preview feature 'avro' is on, and 'tsp-avro' could not be loaded: ${"reason"} That library holds the Avro walk, and this emitter carries no copy of it. Install 'tsp-avro' beside this emitter, or remove 'avro' from \`preview-features\` in \`tspconfig.yaml\`.`,
      },
    },
    "conflicting-generated-schema-source": {
      severity: "error",
      messages: {
        default: paramMessage`Two preview features generate the ${"slot"} schema of this model: '${"first"}' and '${"second"}'. There is no order between them, so the emitter cannot choose one. Turn one of the two off in \`preview-features\` in \`tspconfig.yaml\`.`,
      },
    },
    "conflicting-message-schema-source": {
      severity: "warning",
      messages: {
        default: paramMessage`This message carries a payload written with @rawPayload, and the preview feature '${"provider"}' generated one for it too. The authored schema is the explicit statement of the two, so the document carries it and the generated one was dropped. Remove @rawPayload from this model, or turn '${"provider"}' off in \`preview-features\` in \`tspconfig.yaml\`.`,
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
          "This message takes its headers from more than one source. The three sources are a field marked @header, a model given to @headers, and a schema given to @rawHeaders. There is no rule that picks one over the others, so no `headers` were emitted at all. Keep one of the sources.",
      },
    },
    "duplicate-raw-payload-decorator": {
      severity: "error",
      messages: {
        default:
          "@rawPayload is applied to this model more than once. A message carries one payload, so only one application takes effect and the rest are discarded. Remove the extra @rawPayload.",
      },
    },
    "duplicate-raw-headers-decorator": {
      severity: "error",
      messages: {
        default:
          "@rawHeaders is applied to this model more than once. A message carries one headers schema, so only one application takes effect and the rest are discarded. Remove the extra @rawHeaders.",
      },
    },
    "empty-schema-format": {
      severity: "error",
      messages: {
        default:
          "This decorator was given an empty schemaFormat. A blank schemaFormat names no schema language, so it cannot reach the emitted message. This decorator was dropped, and the message falls back to the schema built from the model. Give it a format, such as 'application/vnd.apache.avro;version=1.9.0'.",
      },
    },
    "unknown-schema-format": {
      severity: "warning",
      messages: {
        default: paramMessage`'${"format"}' is not one of the schemaFormat values AsyncAPI requires or recommends. A custom value is legal, so this one is still emitted. A custom value must not be one of the listed identifiers used with another meaning. Check the spelling, and note that every listed value carries a version, such as 'application/vnd.apache.avro;version=1.9.0'.`,
      },
    },
    "invalid-raw-schema": {
      severity: "error",
      messages: {
        default:
          "The schema given to this decorator cannot be represented as JSON, so it would write nothing into the document. This decorator was dropped, and the message falls back to the schema built from the model. Write the schema as a value the emitter can serialize, such as an object value or a string.",
      },
    },
    "non-string-raw-schema": {
      severity: "error",
      messages: {
        default: paramMessage`'${"format"}' is not a JSON based schema language, so AsyncAPI requires its schema to be inlined as a string. This schema was given as an object, and it is emitted as written. Write the schema as a string, such as the text of the .proto definition, or name a format that is JSON based.`,
      },
    },
    "string-raw-schema": {
      severity: "error",
      messages: {
        default: paramMessage`'${"format"}' is a JSON based schema language, so AsyncAPI requires its schema to be inlined rather than given as text to be parsed. This schema is a string that opens a JSON object or array, and the official parser rejects a document that carries one. Write the schema as an object value. Note that a bare JSON string is still allowed, because a format such as Avro names its primitive types that way.`,
      },
    },
    "raw-schema-local-ref": {
      severity: "error",
      messages: {
        default: paramMessage`This schema refers to '${"ref"}', and it is written in '${"format"}'. AsyncAPI requires both ends of a $ref to carry the same schemaFormat. Every schema this emitter writes into the document is an AsyncAPI Schema Object, so the two ends disagree. The schema is emitted as written. Inline the definition instead of referring to it, or write this schema in the AsyncAPI Schema Object format.`,
      },
    },
    "unresolved-raw-schema-ref": {
      severity: "error",
      messages: {
        default: paramMessage`This schema refers to '${"ref"}', and the emitted document holds nothing there. A reference that starts with '#/' points into this document, and the emitter writes every location it can reach. A parser rejects the document as written. Note that a model reaches components.schemas only when some message uses it, and a @rawPayload model is not such a message. Point at a location the document holds, or inline the definition instead of referring to it.`,
      },
    },
    "raw-payload-lifted-header": {
      severity: "error",
      messages: {
        default: paramMessage`The message model '${"name"}' carries @rawPayload and also lifts @header fields into its \`headers\`. The emitter emits the raw payload exactly as written, so it cannot remove the lifted fields from a schema it does not read. The raw payload and the headers are both emitted, and they can describe the same field twice. Describe the headers of '${"name"}' with @headers or @rawHeaders, or drop the @header marks and let the raw schema carry those fields.`,
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
        default: paramMessage`The field '${"field"}' is lifted into the \`headers\` of message '${"base"}'. Message '${"message"}' extends '${"base"}' and describes its own headers with @headers or @rawHeaders, so the lift is cancelled and the field stays in the payload of '${"message"}'. The same field is then a header of '${"base"}' and payload data of '${"message"}'. Add the field to the headers schema of '${"message"}', or drop that decorator so '${"message"}' inherits the header.`,
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
    "invalid-extension-key": {
      severity: "error",
      messages: {
        default: paramMessage`The extension key '${"key"}' is not a specification extension name. AsyncAPI reads only a key of the shape 'x-' followed by one or more letters, digits, underscores, dots, or hyphens, so this @extension was dropped. Rename the key to that shape.`,
      },
    },
    "duplicate-extension-key": {
      severity: "error",
      messages: {
        default: paramMessage`The extension key '${"key"}' is applied to this target more than once. An object carries one value per key, so this @extension was dropped and the first one with this key in source order was kept. Remove the extra @extension, or give it another key.`,
      },
    },
    "unserializable-extension": {
      severity: "warning",
      messages: {
        default: paramMessage`The value of the extension key '${"key"}' could not be serialized to JSON, so this @extension was dropped. Give the key a value the emitter can write.`,
      },
    },
    "extension-target-not-emitted": {
      severity: "warning",
      messages: {
        default:
          "@extension sits on a target that emits no info, channel, operation, or message object, so it reaches no part of the document. Every @extension here was dropped. Move it to the service namespace, a channel, an operation, or a @message model.",
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
          "The channel id given to this decorator is blank. The id is the key of this channel in the emitted `channels` map, and a blank key names nothing. This channel was dropped. Give it an id, or leave the argument out so the address, or the interface or namespace name for a dynamic channel, is used.",
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
    "duplicate-channel-address": {
      severity: "warning",
      messages: {
        default: paramMessage`Channel '${"id"}' and channel '${"other"}' both use the address '${"address"}'. AsyncAPI allows it, because the two have different ids, but a reader cannot tell which set of messages one address actually carries. Give them one channel with both operations, or give each its own address.`,
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
    "undeclared-server-variable": {
      // This is a warning, not an error, because the server survives it. An
      // error stops the compiler from running the emitter, so no document
      // would be written at all, and the promise the message makes could
      // not be kept.
      severity: "warning",
      messages: {
        default: paramMessage`The template '{${"name"}}' in this server has no matching entry in \`variables\`. A reader cannot tell what to put there. The server is still emitted, with the template text unchanged. Add '${"name"}' to \`variables\`, or take the template out of \`host\` and \`pathname\`.`,
      },
    },
    "unused-server-variable": {
      severity: "warning",
      messages: {
        default: paramMessage`The variable '${"name"}' is declared on this server, and neither \`host\` nor \`pathname\` uses a '{${"name"}}' template. The variable is still emitted. Use it in one of the two fields, or remove it.`,
      },
    },
    "blank-server-variable-value": {
      // This is a warning, not an error, because the variable survives it.
      // An error stops the compiler from running the emitter, so no document
      // would be written at all, and the promise the message makes could
      // not be kept.
      severity: "warning",
      messages: {
        default: paramMessage`The \`${"field"}\` of the server variable '${"name"}' holds an entry that is blank. A blank entry names no value, so it was dropped. A list left with no entry at all is dropped whole, and the variable is then emitted without it. Give every entry a value, or remove the ones that carry none.`,
      },
    },
    "duplicate-server-variable-value": {
      // A warning for the same reason the blank check above is one. The
      // variable survives, and an error would stop the emitter before it
      // could write the document this message describes.
      severity: "warning",
      messages: {
        default: paramMessage`The \`enum\` of the server variable '${"name"}' names '${"value"}' more than once. AsyncAPI requires the entries to be unique, so a repeat makes the whole document fail validation. The repeat was dropped. Note that two entries that differ only in surrounding whitespace become the same value, because every entry is trimmed first.`,
      },
    },
    "server-variable-default-not-in-enum": {
      severity: "warning",
      messages: {
        default: paramMessage`The variable '${"name"}' has the default '${"default"}', which is not one of its \`enum\` values. A client that takes the default then holds a value the same variable forbids. Both values are still emitted.`,
      },
    },
    "duplicate-security-scheme-name": {
      severity: "error",
      messages: {
        default: paramMessage`Duplicate security scheme name: '${"name"}'. Each @securityScheme needs its own name, because the name is the key of that scheme in components.securitySchemes. This @securityScheme was dropped, and the first one with this name in source order was kept.`,
      },
    },
    "invalid-security-scheme-name": {
      severity: "error",
      messages: {
        default: paramMessage`Invalid security scheme name: '${"name"}'. AsyncAPI only allows letters, digits, '.', '-', and '_' in a components key. This decorator was dropped.`,
      },
    },
    "empty-security-scheme-field": {
      severity: "error",
      messages: {
        default: paramMessage`Empty security scheme field: '${"field"}'. AsyncAPI requires a value for this field on this kind of scheme. This @securityScheme was dropped.`,
      },
    },
    "blank-security-scope-name": {
      // This is a warning, not an error, because the scheme survives it. An
      // error stops the compiler from running the emitter, so no document
      // would be written at all, and the promise the message makes could
      // not be kept.
      severity: "warning",
      messages: {
        default:
          "The `scopes` of this security scheme hold an entry that is blank. A blank entry names no scope, so it was dropped. A list left with no entry at all still reaches the document, and AsyncAPI reads it as 'this scheme needs no scope'. Give every entry a scope name, or remove the ones that carry none.",
      },
    },
    "invalid-url": {
      severity: "error",
      messages: {
        default: paramMessage`The '${"field"}' value '${"url"}' is not an absolute URL. AsyncAPI requires an absolute URL here, and a parser rejects the whole document over a relative one. This decorator was dropped. Write a URL with a scheme, such as 'https://example.com/token'.`,
      },
    },
    "missing-oauth-flow-url": {
      severity: "error",
      messages: {
        default: paramMessage`The '${"flow"}' OAuth flow needs a '${"field"}'. A blank value counts as a missing one, because no client can call it. This @securityScheme was dropped.`,
      },
    },
    "empty-oauth-flows": {
      severity: "error",
      messages: {
        default:
          "This oauth2 scheme declares no flow. A client then has no way to obtain a token. This @securityScheme was dropped. Declare at least one of `implicit`, `password`, `clientCredentials`, and `authorizationCode`.",
      },
    },
    "use-security-outside-server": {
      severity: "warning",
      messages: {
        default: paramMessage`@useSecurity('${"schemeName"}') on namespace '${"namespace"}' was dropped. The \`security\` array sits on a server, and this namespace declares no @server. Move this @useSecurity to the namespace that carries @server.`,
      },
    },
    "undeclared-security-scheme": {
      // This is a warning, not an error, because the document survives it.
      // An error stops the compiler before the emitter writes anything, and
      // the check runs while the document is built.
      severity: "warning",
      messages: {
        default: paramMessage`@useSecurity('${"schemeName"}') names a security scheme that no @securityScheme defines. The emitted reference would point at nothing, and no parser could resolve it. This entry was dropped. Declare a @securityScheme with this name, or correct the name.`,
      },
    },
    "duplicate-send-decorator": {
      severity: "error",
      messages: {
        default:
          "@send is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @send.",
      },
    },
    "duplicate-receive-decorator": {
      severity: "error",
      messages: {
        default:
          "@receive is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @receive.",
      },
    },
    "conflicting-operation-actions": {
      severity: "error",
      messages: {
        default:
          "@send and @receive are both applied to this operation. One states that this application sends the message and the other states that it receives one, and no rule picks a winner, so no operation was emitted at all. Keep one of the two.",
      },
    },
    "empty-operation-id": {
      severity: "error",
      messages: {
        default:
          "The operation id given to this decorator is blank. The id is the key of this operation in the emitted `operations` map, and a blank key names nothing. This operation was dropped. Give it an id, or leave the argument out so the operation name is used.",
      },
    },
    "duplicate-operation-id": {
      severity: "error",
      messages: {
        default: paramMessage`Duplicate operation id: '${"id"}'. Each operation needs its own id, because the id is the key of that operation in the emitted document. This operation was dropped, and the first one with this id in source order was kept. Pass an explicit id to @send or @receive on one of them.`,
      },
    },
    "operation-without-channel": {
      // This is a warning, not an error, for the reason every build-time
      // "this decorator reaches nothing" check here is one. The check needs
      // the built channel set. An error stops the compiler before the
      // document this message describes is written.
      severity: "warning",
      messages: {
        default: paramMessage`The operation '${"name"}' carries @send or @receive, and the interface or namespace around it carries no emitted channel. An operation always points at a channel, so this one reaches no part of the document. This operation was dropped. Add @channel or @dynamicChannel to the interface or namespace that holds it.`,
      },
    },
    "duplicate-reply-channel-decorator": {
      severity: "error",
      messages: {
        default:
          "@replyChannel is applied to this operation more than once. A reply points at one channel, so only one application takes effect and the rest are discarded. Remove the extra @replyChannel.",
      },
    },
    "duplicate-reply-address-decorator": {
      severity: "error",
      messages: {
        default:
          "@replyAddress is applied to this operation more than once. A reply carries one address, so only one application takes effect and the rest are discarded. Remove the extra @replyAddress.",
      },
    },
    "invalid-reply-address-location": {
      severity: "error",
      messages: {
        default: paramMessage`'${"location"}' is not a legal reply address location, so no \`address\` was emitted on the reply. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/replyTo'.`,
      },
    },
    "reply-channel-not-a-channel": {
      severity: "warning",
      messages: {
        default: paramMessage`@replyChannel names '${"name"}', and that interface or namespace carries no emitted channel. A reply whose channel is unknown carries neither a checkable message list nor a checkable address, so the whole \`reply\` object was dropped. Add @channel or @dynamicChannel to '${"name"}'.`,
      },
    },
    "reply-address-needs-dynamic-channel": {
      severity: "warning",
      messages: {
        default: paramMessage`@replyAddress is given, and the reply channel '${"id"}' carries an address. AsyncAPI requires the address of that channel to be null when a reply address is given. The \`address\` was dropped from the reply, and the rest of the reply was kept. Declare '${"id"}' with @dynamicChannel instead of @channel.`,
      },
    },
    "reply-without-action": {
      severity: "warning",
      messages: {
        default:
          "@replyChannel or @replyAddress is applied to an operation that carries neither @send nor @receive. A reply sits on an emitted operation, so this decorator reaches no part of the document. Add @send or @receive to this operation, or remove the reply decorator.",
      },
    },
    "duplicate-binding": {
      severity: "error",
      messages: {
        default: paramMessage`The protocol '${"protocol"}' already has a binding at the ${"level"} level on this target. A Bindings Object carries one member per protocol, and two configurations are neither merged nor allowed to overwrite each other. This binding was dropped, and the first one in source order was kept. Keep one of the two, and note that @binding("${"protocol"}", ...) claims the same member as the decorator named after that protocol.`,
      },
    },
    "empty-binding-protocol": {
      severity: "error",
      messages: {
        default:
          "The protocol name given to @binding is blank. The name becomes a member name of the emitted `bindings` object, and a blank member name is not legal. This binding was dropped. Name the protocol, such as `kafka` or `mqtt`.",
      },
    },
    "invalid-binding-config": {
      severity: "error",
      messages: {
        default: paramMessage`The config given to @binding("${"protocol"}", ...) is not an object. Every member of a Bindings Object is an object, so this binding was dropped. Write the config as an object value, such as #{ qos: 2 }.`,
      },
    },
    // A warning, not an error, because the message states a recovery and the
    // emitter performs it. The field is dropped and the rest of the binding
    // is emitted. An error would stop the document from being written at
    // all, so the author could never see the recovery the message promises.
    // The sibling binding codes are errors because they drop a whole
    // binding, and nothing survives for the author to inspect.
    "invalid-binding-field": {
      severity: "warning",
      messages: {
        default: paramMessage`The ${"protocol"} binding field '${"field"}' expects ${"expected"}. The value given here is outside that, so the field was dropped and the rest of the binding was kept.`,
      },
    },

    // This one is an error, for the reason stated above the code before it.
    // A binding whose required field is absent cannot be written as a valid
    // document, so the whole binding goes and nothing survives to inspect.
    "missing-binding-field": {
      severity: "error",
      messages: {
        default: paramMessage`The ${"protocol"} binding requires the field '${"field"}', and this binding does not give it. AsyncAPI would reject the emitted document, so the whole binding was dropped. Add '${"field"}' to the decorator config.`,
      },
    },
    // The level-less wording is a second message, not the default message
    // with another level value. `@binding` records the level `any`, which is
    // not a position in the document. Interpolating it would read "for the
    // any level" and send the author looking for a position that does not
    // exist. So the second wording names all four objects instead.
    "binding-outside-document": {
      severity: "warning",
      messages: {
        default: paramMessage`A '${"protocol"}' binding for the ${"level"} level sits on a target that emits no such object, so it reaches no part of the document. This binding was dropped. Add the decorator that emits the object: @channel or @dynamicChannel for a channel, @send or @receive for an operation, @message for a message, and @server on the service namespace for a server.`,
        anyLevel: paramMessage`The '${"protocol"}' binding given to @binding sits on a target that emits no server, no channel, no operation and no message, so it reaches no part of the document. This binding was dropped. Add the decorator that emits the object: @channel or @dynamicChannel for a channel, @send or @receive for an operation, @message for a message, and @server on the service namespace for a server.`,
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
