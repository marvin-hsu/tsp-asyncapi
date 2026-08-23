/**
 * The public API of this package.
 *
 * Every name here is listed on purpose. An `export *` would publish whatever a
 * module happens to export, which already caught this project once: a state
 * helper meant for one builder became part of the package's runtime surface
 * because it sat in a re-exported file. An `@internal` tag does not prevent
 * that, since it only affects the API report.
 *
 * The decorator implementations are not here. `src/tsp-index.ts` hands those to
 * the compiler.
 *
 * This package declares the input language and emits nothing. So the API is the
 * two things a consumer needs in order to read what an author declared: the
 * library definition, and a reader for each kind of decorator state.
 */

export { $lib, createDiagnostic, reportDiagnostic, LIBRARY_NAME, PACKAGE_NAME } from "./lib.js";

// Readers for the state the decorators record. A tool built on top of this
// emitter uses these; applying a decorator is the compiler's job.
export {
  getAsyncTags,
  getChannel,
  getContentType,
  getCorrelationId,
  getExtensions,
  getExternalDocs,
  getHeadersModel,
  getInfo,
  getJsonSchemaExtensions,
  getMessageExamples,
  getOperationAction,
  getParameterLocation,
  getRawHeaders,
  getRawPayload,
  getReplyAddress,
  getReplyChannel,
  getSecuritySchemes,
  getServers,
  getUsedSecuritySchemes,
  getUsedServers,
  isHeader,
  isOneOf,
  listChannels,
  listMessages,
  type AsyncAPIInfoState,
  type AsyncTagExternalDocs,
  type AsyncTagMetadata,
  type AsyncTagState,
  type AsyncAPISecuritySchemeState,
  type AsyncAPIServerState,
  type AsyncAPIServerVariableState,
  type ChannelState,
  type ChannelTarget,
  type CorrelationIdState,
  type ExternalDocsState,
  type JsonSchemaExtensionRecord,
  type KafkaChannelBindingConfig,
  type KafkaMessageBindingConfig,
  type KafkaOperationBindingConfig,
  type KafkaServerBindingConfig,
  type MessageExampleOptions,
  type MessageExampleState,
  type MessageState,
  type OperationAction,
  type OperationActionState,
  type RawSchemaState,
  type ReplyAddressState,
  type UseSecurityTarget,
  type UseServerState,
  type AmqpChannelBindingConfig,
  type AnypointMqChannelBindingConfig,
  type AnypointMqMessageBindingConfig,
  type AmqpMessageBindingConfig,
  type AmqpOperationBindingConfig,
  type HttpMessageBindingConfig,
  type GooglePubSubChannelBindingConfig,
  type GooglePubSubMessageBindingConfig,
  type HttpOperationBindingConfig,
  type IbmMqChannelBindingConfig,
  type IbmMqMessageBindingConfig,
  type IbmMqServerBindingConfig,
  type JmsChannelBindingConfig,
  type JmsMessageBindingConfig,
  type JmsServerBindingConfig,
  type NatsOperationBindingConfig,
  type PulsarChannelBindingConfig,
  type PulsarServerBindingConfig,
  type SolaceOperationBindingConfig,
  type SolaceServerBindingConfig,
  type SqsChannelBindingConfig,
  type SqsOperationBindingConfig,
  type MqttMessageBindingConfig,
  type MqttOperationBindingConfig,
  type MqttServerBindingConfig,
  type WebSocketChannelBindingConfig,
} from "./decorators/index.js";

// The seam an emitter package builds on.
//
// Everything below is here because `lower/` in an emitter package needs it,
// and an emitter package is no longer the same package as this one. In a
// single package these were internal, and the compiler enforced nothing about
// them.
//
// They are a public promise now. Renaming one of these constants, or changing
// what `declarationNameFor` returns, is a minor version of this package. That is the price
// of the split, and it is paid here rather than hidden behind a second entry
// point.

// The two readers `lower/` calls while it translates a model. Reading a
// decorator annotation is part of the translation, which is the rule
// `lower/schemas/` already follows.
export { localRef } from "./decorators/index.js";
export type { BindingRenderer } from "./decorators/bindings/state.js";

// Default values and shared constants. Nothing here is computed, and the
// binding versions are the specification version each protocol's binding
// object declares.
export {
  AMQP_BINDING_VERSION,
  ANYPOINT_MQ_BINDING_VERSION,
  ASYNCAPI_VERSION,
  CHANNEL_REF_PREFIX,
  COMPONENTS_MESSAGE_REF_PREFIX,
  COMPONENTS_SCHEMA_REF_PREFIX,
  GOOGLE_PUB_SUB_BINDING_VERSION,
  HTTP_BINDING_VERSION,
  IBM_MQ_BINDING_VERSION,
  isGlobalTypeSpecNamespace,
  JMS_BINDING_VERSION,
  JSON_SCHEMA_TYPE,
  KAFKA_BINDING_VERSION,
  LOCAL_REF_PREFIX,
  MQTT_BINDING_VERSION,
  NATS_BINDING_VERSION,
  PULSAR_BINDING_VERSION,
  SCHEMA_ENCODING_MIME_TYPE,
  SCHEMA_FORMAT,
  SECURITY_SCHEME_REF_PREFIX,
  SERVER_REF_PREFIX,
  SOLACE_BINDING_VERSION,
  SQS_BINDING_VERSION,
  WEBSOCKET_BINDING_VERSION,
} from "./constants.js";

// How a declaration's name is computed, and how a `$ref` to it is spelled.
export {
  declarationNameFor,
  fallbackDeclarationName,
  isUninstantiatedTemplateDeclaration,
} from "./naming.js";

// The one rule for whether an optional field is written at all.
export { present, text } from "./optional-fields.js";

// The one rule for turning a marshalled decorator argument into plain JSON.
export { isPlainObject, toPlainValue } from "./marshalled-values.js";

// TypeSpec values to JSON, for examples and default values.
export { serializeDefaultValue, serializeExamples } from "./example-serialization.js";

// `@externalDocs` on any target.
export { buildExternalDocs } from "./external-docs.js";
