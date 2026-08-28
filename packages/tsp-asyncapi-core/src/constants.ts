/**
 * Constants this package's other modules share.
 *
 * A JSON Schema type string, a JSON Pointer prefix, and a binding version
 * number each have exactly one correct spelling. Writing that spelling out
 * again at every call site invites drift, because the type system cannot
 * catch a typo in a plain string. Collecting each value here turns a typo
 * into a single-point fix.
 *
 * Most of the constants below are `@public`. An emitter package built on
 * top of this one reads them directly, instead of hardcoding the same
 * specification value a second time.
 */

import { Namespace } from "@typespec/compiler";

/**
 * JSON Schema `type` keyword values this emitter emits.
 *
 * `SchemaObject.type` is a plain `string`, not a string-literal union.
 * Nothing in the type system catches a typo in one of these values, unlike
 * a `Type["kind"]` discriminated-union branch. Collecting the values here
 * turns a typo into a single-point fix.
 *
 * @public
 */
export const JSON_SCHEMA_TYPE = {
  string: "string",
  number: "number",
  integer: "integer",
  boolean: "boolean",
  null: "null",
  array: "array",
  object: "object",
} as const;

/** Name of the compiler's built-in global namespace (home of `Array`, `Record`, ...). */
const TYPESPEC_NAMESPACE_NAME = "TypeSpec";

/**
 * True for the namespace node representing the compiler's built-in
 * `TypeSpec` namespace itself, sitting directly under the global (unnamed)
 * namespace. Not true for any other namespace, including a user namespace
 * that happens to share the name.
 *
 * @public
 */
export function isGlobalTypeSpecNamespace(ns: Namespace | undefined): boolean {
  return ns?.name === TYPESPEC_NAMESPACE_NAME && !ns.namespace?.name;
}

/**
 * The AsyncAPI specification version every emitted document declares.
 *
 * The emitter targets 3.1 throughout: the shape of the document, the
 * Schema Object dialect, and the key charsets all follow that release.
 * Naming it here means the version and the reason for it sit together,
 * rather than appearing as a bare string in the document builder.
 *
 * @public
 */
export const ASYNCAPI_VERSION = "3.1.0";

/**
 * The `info.title` used when nothing supplies one.
 *
 * This applies when the program declares no `@service` at all, and when a
 * service declares no title. Both cases mean the same thing, so they use
 * the same value.
 */
export const DEFAULT_DOCUMENT_TITLE = "AsyncAPI Document";

/**
 * The prefix every reference into the document that carries it starts with.
 *
 * The prefixes below all extend it. A raw schema can carry a reference of its
 * own, and this is the prefix that tells the emitter to resolve it against
 * the emitted document.
 *
 * @public
 */
export const LOCAL_REF_PREFIX = "#/";

/**
 * The prefix of a JSON Pointer into `components.securitySchemes`.
 *
 * A server names its schemes through a reference, never through an inline
 * copy of the scheme. Every such reference is built from this prefix and the
 * scheme name, so the pointer is written in one place only.
 *
 * @public
 */
export const SECURITY_SCHEME_REF_PREFIX = "#/components/securitySchemes/";

/**
 * The prefix of a JSON Pointer into the root `channels` map.
 *
 * An operation names its channel through a reference, and so does a reply.
 * The `messages` of both are addressed through the same root, one segment
 * deeper. Every one of those pointers is built from this prefix, so the
 * pointer root is written in one place only.
 *
 * @public
 */
export const CHANNEL_REF_PREFIX = "#/channels/";

/**
 * The prefix of a JSON Pointer into `components.messages`.
 *
 * A channel names each message it carries through a reference into the
 * components section. An operation never uses this prefix: it addresses the
 * `messages` map of its channel instead.
 *
 * @public
 */
export const COMPONENTS_MESSAGE_REF_PREFIX = "#/components/messages/";

/**
 * The prefix of a JSON Pointer into the root `servers` map.
 *
 * A channel names each server it is available on through a reference into
 * this map.
 *
 * @public
 */
export const SERVER_REF_PREFIX = "#/servers/";

/**
 * The prefix of a JSON Pointer into `components.schemas`.
 *
 * Every schema this emitter names is defined once in the components section,
 * and every other place that needs it refers to it through this prefix.
 *
 * @public
 */
export const COMPONENTS_SCHEMA_REF_PREFIX = "#/components/schemas/";

/**
 * What joins the interface name and the operation name in the key of an
 * inherited operation.
 *
 * `interface C extends Base` copies each operation of `Base` into `C`, so the
 * declaration name alone cannot key the copies. The key qualifies the name
 * with the interface that inherited it. `@typespec/openapi3` joins the same
 * two parts with the same character in its default `parent-container`
 * strategy.
 */
export const INHERITED_OPERATION_ID_SEPARATOR = "_";

/**
 * The character set AsyncAPI 3 allows for a key of the root `servers` map.
 *
 * This set is stricter than the one for a key of the Components Object. A
 * dot is not allowed here.
 */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * The character set AsyncAPI 3 allows for a key of the Components Object.
 *
 * A dot is allowed here, unlike in a key of the root `servers` map. Three
 * places check a name against this set. `@securityScheme` writes the name as
 * a key, `@useSecurity` writes it into a JSON Pointer that addresses such a
 * key, and `isSafeComponentsKey` in `naming.ts` answers whether a schema or
 * message key can be used as it is written. All three need the same answer,
 * so the pattern lives in one place.
 */
export const COMPONENTS_KEY_PATTERN = /^[a-zA-Z0-9.\-_]+$/;

/**
 * The one `http` authorization scheme that takes a `bearerFormat`.
 *
 * AsyncAPI defines a separate object for the bearer scheme, and only that
 * object carries `bearerFormat`. A validator rejects the field next to any
 * other scheme, so the emitter compares against this value before it writes
 * the field.
 */
export const HTTP_BEARER_SCHEME = "bearer";

/**
 * The member name the Kafka bindings claim inside a Bindings Object.
 */
export const KAFKA_BINDING_PROTOCOL = "kafka";

/**
 * The version of the Kafka binding specification this library emits.
 *
 * Every Kafka binding carries this field. The specification says a reader
 * must assume `latest` when the field is absent, which makes the meaning of
 * the document drift as the binding specification moves. A contract cannot
 * drift, so the version is always written.
 *
 * The Kafka renderer is the one place that writes it. A decorator records
 * fields and never the version, so raising this constant moves all four
 * levels at once.
 *
 * @public
 */
export const KAFKA_BINDING_VERSION = "0.5.0";

/**
 * The member name the WebSocket binding claims inside a Bindings Object.
 *
 * The member is `ws`, not `websocket`. AsyncAPI names the binding folder
 * `websockets` and the member `ws`, and the member name is the one a reader
 * of the document sees.
 */
export const WEBSOCKET_BINDING_PROTOCOL = "ws";

/**
 * The version of the WebSocket binding specification this library emits.
 *
 * It is written for the same reason the Kafka version is. A document that
 * leaves the field out means `latest`, and what `latest` holds changes over
 * time.
 *
 * @public
 */
export const WEBSOCKET_BINDING_VERSION = "0.1.0";

/**
 * The member name the MQTT bindings claim inside a Bindings Object.
 */
export const MQTT_BINDING_PROTOCOL = "mqtt";

/**
 * The version of the MQTT binding specification this library emits.
 *
 * One binding covers MQTT 3 and MQTT 5. The fields that only MQTT 5 defines
 * are optional, so a document for MQTT 3 leaves them out.
 *
 * @public
 */
export const MQTT_BINDING_VERSION = "0.2.0";

/**
 * The member name the HTTP bindings claim inside a Bindings Object.
 */
export const HTTP_BINDING_PROTOCOL = "http";

/**
 * The version of the HTTP binding specification this library emits.
 *
 * AsyncAPI 3.0 accepts both `0.2.0` and `0.3.0`. This library emits `0.3.0`,
 * which is the later of the two and adds `statusCode` to the message binding.
 *
 * @public
 */
export const HTTP_BINDING_VERSION = "0.3.0";

/**
 * The member name the AMQP bindings claim inside a Bindings Object.
 *
 * The member is `amqp`. It covers AMQP 0-9-1, which is the version RabbitMQ
 * speaks. AsyncAPI defines a separate `amqp1` binding for AMQP 1.0, and this
 * library does not emit it.
 */
export const AMQP_BINDING_PROTOCOL = "amqp";

/**
 * The version of the AMQP binding specification this library emits.
 *
 * @public
 */
export const AMQP_BINDING_VERSION = "0.3.0";

/**
 * The member name the NATS binding claims inside a Bindings Object.
 */
export const NATS_BINDING_PROTOCOL = "nats";

/**
 * The version of the NATS binding specification this library emits.
 *
 * @public
 */
export const NATS_BINDING_VERSION = "0.1.0";

/**
 * The member name the Pulsar bindings claim inside a Bindings Object.
 */
export const PULSAR_BINDING_PROTOCOL = "pulsar";

/**
 * The version of the Pulsar binding specification this library emits.
 *
 * @public
 */
export const PULSAR_BINDING_VERSION = "0.1.0";

/**
 * The member name the Google Cloud Pub/Sub bindings claim inside a Bindings
 * Object.
 */
export const GOOGLE_PUB_SUB_BINDING_PROTOCOL = "googlepubsub";

/**
 * The version of the Google Cloud Pub/Sub binding specification this library
 * emits.
 *
 * @public
 */
export const GOOGLE_PUB_SUB_BINDING_VERSION = "0.2.0";

/**
 * The member name the Amazon SQS bindings claim inside a Bindings Object.
 */
export const SQS_BINDING_PROTOCOL = "sqs";

/**
 * The version of the Amazon SQS binding specification this library emits.
 *
 * AsyncAPI 3.0 accepts both `0.1.0` and `0.2.0`. This library emits `0.2.0`,
 * which is the later of the two.
 *
 * @public
 */
export const SQS_BINDING_VERSION = "0.2.0";

/**
 * The member name the Anypoint MQ bindings claim inside a Bindings Object.
 */
export const ANYPOINT_MQ_BINDING_PROTOCOL = "anypointmq";

/**
 * The version of the Anypoint MQ binding specification this library emits.
 *
 * @public
 */
export const ANYPOINT_MQ_BINDING_VERSION = "0.0.1";

/**
 * The member name the JMS bindings claim inside a Bindings Object.
 */
export const JMS_BINDING_PROTOCOL = "jms";

/**
 * The version of the JMS binding specification this library emits.
 *
 * @public
 */
export const JMS_BINDING_VERSION = "0.0.1";

/**
 * The member name the IBM MQ bindings claim inside a Bindings Object.
 */
export const IBM_MQ_BINDING_PROTOCOL = "ibmmq";

/**
 * The version of the IBM MQ binding specification this library emits.
 *
 * @public
 */
export const IBM_MQ_BINDING_VERSION = "0.1.0";

/**
 * The member name the Solace bindings claim inside a Bindings Object.
 */
export const SOLACE_BINDING_PROTOCOL = "solace";

/**
 * The version of the Solace binding specification this library emits.
 *
 * AsyncAPI 3.0 accepts `0.2.0`, `0.3.0` and `0.4.0`. This library emits
 * `0.4.0`, which is the latest. The `0.2.0` schema misspells the server
 * field `msvVpn`; `0.3.0` onward spells it `msgVpn`.
 *
 * @public
 */
export const SOLACE_BINDING_VERSION = "0.4.0";

/**
 * The `schemaFormat` values that name the AsyncAPI Schema Object itself.
 *
 * Every schema this emitter writes into `components.schemas` is an AsyncAPI
 * Schema Object. So a `$ref` into this document always points at one of these
 * three formats. The raw schema decorators compare against this list to tell
 * whether a `$ref` inside a raw schema can agree with its target.
 *
 * The three entries carry the version of the document the emitter writes. See
 * `MULTI_FORMAT_SCHEMA_FORMATS`.
 */
export const NATIVE_SCHEMA_FORMATS: readonly string[] = [
  `application/vnd.aai.asyncapi;version=${ASYNCAPI_VERSION}`,
  `application/vnd.aai.asyncapi+json;version=${ASYNCAPI_VERSION}`,
  `application/vnd.aai.asyncapi+yaml;version=${ASYNCAPI_VERSION}`,
];

/**
 * The listed `schemaFormat` values whose schema language is not JSON based.
 *
 * AsyncAPI requires such a schema to be inlined as a string. Protobuf is the
 * example the specification gives, and the two Protobuf identifiers are the
 * only listed values with that property. A custom value can name another
 * non-JSON language, and the emitter cannot know that, so this list only
 * covers the listed ones.
 */
export const NON_JSON_SCHEMA_FORMATS: readonly string[] = [
  "application/vnd.google.protobuf;version=2",
  "application/vnd.google.protobuf;version=3",
];

/**
 * The `schemaFormat` values AsyncAPI 3 names for a Multi Format Schema
 * Object.
 *
 * The list holds the formats the specification requires a tool to support.
 * It also holds the formats the specification recommends. A value outside
 * this list is still legal, because the specification allows a custom value.
 * So the emitter warns about an unlisted value and still emits it.
 *
 * The `+json` and `+yaml` variants are separate entries. A parser matches the
 * whole string, so `application/vnd.aai.asyncapi` and
 * `application/vnd.aai.asyncapi+json` are two values.
 *
 * The three AsyncAPI Schema Object entries come from `NATIVE_SCHEMA_FORMATS`.
 * They carry the version of the document the emitter writes. The
 * specification names them at the release the document declares.
 * `application/vnd.aai.asyncapi+json;version={version}` is also the value the
 * specification says `schemaFormat` defaults to. So those three are built from
 * `ASYNCAPI_VERSION`. A hardcoded version would warn about the native format
 * of the document the moment the emitted release moves.
 *
 * The other entries carry the version of the schema language they name, not
 * the version of AsyncAPI. Those are written out.
 */
export const MULTI_FORMAT_SCHEMA_FORMATS: readonly string[] = [
  ...NATIVE_SCHEMA_FORMATS,
  "application/schema+json;version=draft-07",
  "application/schema+yaml;version=draft-07",
  "application/vnd.apache.avro;version=1.9.0",
  "application/vnd.apache.avro+json;version=1.9.0",
  "application/vnd.apache.avro+yaml;version=1.9.0",
  "application/vnd.oai.openapi;version=3.0.0",
  "application/vnd.oai.openapi+json;version=3.0.0",
  "application/vnd.oai.openapi+yaml;version=3.0.0",
  "application/raml+yaml;version=1.0",
  ...NON_JSON_SCHEMA_FORMATS,
];

/**
 * The `info.version` used when nothing supplies one.
 *
 * AsyncAPI requires `info.version`, so the emitter cannot leave it out.
 * This applies when the program declares no `@service`, when `@info` is
 * absent, and when `@info` carries no version.
 */
export const DEFAULT_INFO_VERSION = "0.0.0";

/**
 * The mime type a schema's own property keys are resolved against through
 * `@encodedName`.
 *
 * An `@example`'s object keys are resolved against it too, through the
 * compiler's own `serializeObjectValueAsJson`.
 *
 * This value is hardcoded. The emitter has no notion yet of a message's
 * actual wire content type. A model with both
 * `@encodedName("application/json", ...)` and
 * `@encodedName("application/xml", ...)`, for example, always emits the
 * JSON name. It does this regardless of which content type a message
 * actually declares.
 *
 * `example-serialization.ts` does not read this constant. It assumes
 * `application/json` on its own. The two are not a shared contract yet, so
 * a change to either assumption must update both by hand.
 *
 * @public
 */
export const SCHEMA_ENCODING_MIME_TYPE = "application/json";

/**
 * The JSON Schema `format` values this emitter writes.
 *
 * Two modules decide a format, and they have to agree. `schemas/scalars.ts`
 * maps a TypeSpec scalar onto its format, and `schemas/encoding.ts` reads
 * that format back to decide what `@encode` turns it into. A literal in one
 * and a different literal in the other would not fail the build. It would
 * quietly stop `@encode` from recognising a date, and the document would
 * describe the wrong type.
 *
 * So the two share this one table.
 *
 * @public
 */
export const SCHEMA_FORMAT = {
  /** RFC 3339 date and time, the shape `utcDateTime` travels in. */
  dateTime: "date-time",
  /** RFC 3339 full date, with no time. */
  date: "date",
  /** RFC 3339 time, with no date. */
  time: "time",
  /** ISO 8601 duration, the shape `duration` travels in. */
  duration: "duration",
  /** Base64 text, the shape `bytes` travels in. */
  byte: "byte",
  /** A URI. */
  uri: "uri",
  /** Seconds since the epoch, what `@encode("unixTimestamp")` produces. */
  unixTime: "unixtime",
  /** RFC 7231 date, what `@encode(rfc7231)` produces. */
  httpDate: "http-date",
  /** A sensitive string, what `@secret` produces. */
  password: "password",
} as const;
