/**
 * The decorators this library declares, one module each.
 *
 * The file is a re-export list on purpose. `src/index.ts` names what the
 * package publishes, and `src/tsp-index.ts` names what the compiler binds,
 * so nothing here reaches either surface by accident.
 */

/** @public */
export const namespace = "AsyncAPI";

export { $info, getInfo, type AsyncAPIInfoState } from "./document/info.js";
export {
  $server,
  getServers,
  type AsyncAPIServerState,
  type AsyncAPIServerVariableState,
} from "./servers/server.js";
export {
  $securityScheme,
  getSecuritySchemes,
  type AsyncAPISecuritySchemeState,
} from "./security/scheme.js";
export {
  $useSecurity,
  getUsedSecuritySchemes,
  type UseSecurityTarget,
} from "./security/use-security.js";
export {
  $externalDocs,
  getExternalDocs,
  type ExternalDocsState,
} from "./document/external-docs.js";
export {
  $asyncTag,
  getAsyncTags,
  type AsyncTagExternalDocs,
  type AsyncTagMetadata,
  type AsyncTagState,
} from "./document/async-tag.js";
export { $oneOf, isOneOf } from "./schemas/one-of.js";
export {
  $jsonSchemaExtension,
  getJsonSchemaExtensions,
  type JsonSchemaExtensionRecord,
} from "./schemas/json-schema-extension.js";
export { $message, listMessages, type MessageState } from "./messages/message.js";
export { $contentType, getContentType } from "./messages/content-type.js";
export { $header, isHeader } from "./messages/header.js";
export { $headers, getHeadersModel } from "./messages/headers.js";
export {
  $correlationId,
  getCorrelationId,
  type CorrelationIdState,
} from "./messages/correlation-id.js";
export {
  $channel,
  $dynamicChannel,
  getChannel,
  listChannels,
  type ChannelState,
} from "./channels/channel.js";
export type { ChannelTarget } from "./channels/state.js";
export { $useServer, getUsedServers, type UseServerState } from "./channels/use-server.js";
export { $parameterLocation, getParameterLocation } from "./channels/parameter-location.js";
export {
  $send,
  $receive,
  getOperationAction,
  type OperationAction,
  type OperationActionState,
} from "./operations/action.js";
export {
  $replyChannel,
  $replyAddress,
  getReplyChannel,
  getReplyAddress,
  type ReplyAddressState,
} from "./operations/reply.js";
export { $binding } from "./bindings/binding.js";
export { $kafkaChannel, type KafkaChannelBindingConfig } from "./bindings/kafka/channel.js";
export { $kafkaMessage, type KafkaMessageBindingConfig } from "./bindings/kafka/message.js";
export { $kafkaOperation, type KafkaOperationBindingConfig } from "./bindings/kafka/operation.js";
export { $kafkaServer, type KafkaServerBindingConfig } from "./bindings/kafka/server.js";
export {
  $messageExample,
  getMessageExamples,
  type MessageExampleOptions,
  type MessageExampleState,
} from "./messages/example.js";
