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
export { $extension, getExtensions } from "./extension.js";
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
export { localRef, type RawSchemaState } from "./messages/raw-schema.js";
export { $rawPayload, getRawPayload } from "./messages/raw-payload.js";
export { $rawHeaders, getRawHeaders } from "./messages/raw-headers.js";
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
export { $amqpChannel, type AmqpChannelBindingConfig } from "./bindings/amqp/channel.js";
export {
  $anypointMqChannel,
  $anypointMqMessage,
  type AnypointMqChannelBindingConfig,
  type AnypointMqMessageBindingConfig,
} from "./bindings/anypointmq/index.js";
export {
  $ibmMqChannel,
  $ibmMqMessage,
  $ibmMqServer,
  type IbmMqChannelBindingConfig,
  type IbmMqMessageBindingConfig,
  type IbmMqServerBindingConfig,
} from "./bindings/ibmmq/index.js";
export {
  $jmsChannel,
  $jmsMessage,
  $jmsServer,
  type JmsChannelBindingConfig,
  type JmsMessageBindingConfig,
  type JmsServerBindingConfig,
} from "./bindings/jms/index.js";
export {
  $solaceOperation,
  $solaceServer,
  type SolaceOperationBindingConfig,
  type SolaceServerBindingConfig,
} from "./bindings/solace/index.js";
export {
  $googlePubSubChannel,
  type GooglePubSubChannelBindingConfig,
} from "./bindings/googlepubsub/channel.js";
export {
  $googlePubSubMessage,
  type GooglePubSubMessageBindingConfig,
} from "./bindings/googlepubsub/message.js";
export { $natsOperation, type NatsOperationBindingConfig } from "./bindings/nats.js";
export { $pulsarChannel, type PulsarChannelBindingConfig } from "./bindings/pulsar/channel.js";
export { $pulsarServer, type PulsarServerBindingConfig } from "./bindings/pulsar/server.js";
export { $sqsChannel, type SqsChannelBindingConfig } from "./bindings/sqs/channel.js";
export { $sqsOperation, type SqsOperationBindingConfig } from "./bindings/sqs/operation.js";
export { $amqpMessage, type AmqpMessageBindingConfig } from "./bindings/amqp/message.js";
export { $amqpOperation, type AmqpOperationBindingConfig } from "./bindings/amqp/operation.js";
export { $httpMessage, type HttpMessageBindingConfig } from "./bindings/http/message.js";
export { $httpOperation, type HttpOperationBindingConfig } from "./bindings/http/operation.js";
export { $mqttMessage, type MqttMessageBindingConfig } from "./bindings/mqtt/message.js";
export { $mqttOperation, type MqttOperationBindingConfig } from "./bindings/mqtt/operation.js";
export { $mqttServer, type MqttServerBindingConfig } from "./bindings/mqtt/server.js";
export { $websocketChannel, type WebSocketChannelBindingConfig } from "./bindings/websocket.js";
export {
  $messageExample,
  getMessageExamples,
  type MessageExampleOptions,
  type MessageExampleState,
} from "./messages/example.js";
