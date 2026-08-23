/**
 * The public API of this package.
 *
 * Every name here is listed on purpose. An `export *` would publish
 * whatever a module happens to export, which already caught this project
 * once: a state helper meant for one builder became part of the package's
 * runtime surface because it sat in a re-exported file. An `@internal` tag
 * does not prevent that, since it only affects the API report.
 *
 * The decorators are not here, and neither are the readers for the state they
 * record. Those declare the input language, and they come from
 * `tsp-asyncapi-core`. This package's API is the document it emits.
 */

export { $onEmit } from "./emitter.js";

export { $lib } from "./lib.js";

export type { AsyncAPIEmitterOptions } from "./emitter-options.js";

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
  SpecificationExtensions,
  AmqpChannelBindingObject,
  AnypointMqChannelBindingObject,
  AnypointMqMessageBindingObject,
  AmqpExchangeObject,
  AmqpMessageBindingObject,
  AmqpOperationBindingObject,
  AmqpQueueObject,
  HttpMessageBindingObject,
  GooglePubSubChannelBindingObject,
  GooglePubSubMessageBindingObject,
  GooglePubSubSchemaObject,
  GooglePubSubSchemaSettingsObject,
  GooglePubSubStoragePolicyObject,
  HttpOperationBindingObject,
  IbmMqChannelBindingObject,
  IbmMqMessageBindingObject,
  IbmMqServerBindingObject,
  JmsChannelBindingObject,
  JmsMessageBindingObject,
  JmsServerBindingObject,
  NatsOperationBindingObject,
  PulsarChannelBindingObject,
  PulsarRetentionObject,
  PulsarServerBindingObject,
  SolaceOperationBindingObject,
  SolaceServerBindingObject,
  SqsChannelBindingObject,
  SqsOperationBindingObject,
  SqsQueueObject,
  MqttLastWillObject,
  MqttMessageBindingObject,
  MqttOperationBindingObject,
  MqttServerBindingObject,
  TagObject,
  WebSocketChannelBindingObject,
} from "./types/index.js";
