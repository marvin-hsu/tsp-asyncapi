/**
 * The public API of this package.
 *
 * Every name here is listed on purpose. An `export *` would publish
 * whatever a module happens to export, which already caught this project
 * once: a state helper meant for one builder became part of the package's
 * runtime surface because it sat in a re-exported file. An `@internal` tag
 * does not prevent that, since it only affects the API report.
 *
 * The decorator implementations are not here. `src/tsp-index.ts` hands
 * those to the compiler.
 */

export { $onEmit } from "./emitter.js";

export {
  $lib,
  createDiagnostic,
  reportDiagnostic,
  LIBRARY_NAME,
  type AsyncAPIEmitterOptions,
} from "./lib.js";

export type {
  AsyncAPIDocument,
  BindingObject,
  BindingsObject,
  ChannelObject,
  ComponentsObject,
  ContactObject,
  CorrelationIdObject,
  ExternalDocumentationObject,
  InfoObject,
  KafkaChannelBindingObject,
  KafkaMessageBindingObject,
  KafkaOperationBindingObject,
  KafkaServerBindingObject,
  LicenseObject,
  MessageExampleObject,
  MessageObject,
  MultiFormatSchemaObject,
  OAuthFlowObject,
  OAuthFlowsObject,
  OperationObject,
  OperationReplyAddressObject,
  OperationReplyObject,
  ParameterObject,
  ReferenceObject,
  SchemaObject,
  SecuritySchemeObject,
  SecuritySchemeType,
  ServerObject,
  ServerVariableObject,
  TagObject,
} from "./types.js";

// Readers for the state the decorators record. A tool built on top of this
// emitter uses these; applying a decorator is the compiler's job.
export {
  getAsyncTags,
  getChannel,
  getContentType,
  getCorrelationId,
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
} from "./decorators/index.js";
