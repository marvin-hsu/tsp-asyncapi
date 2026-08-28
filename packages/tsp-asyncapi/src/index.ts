/**
 * The public API of this package.
 *
 * Every name here is listed on purpose. An `export *` can leak an internal
 * helper into the public surface, because it publishes whatever a module
 * happens to export. An `@internal` tag does not prevent that, since it
 * only affects the API report.
 *
 * The decorators are not here, and neither are the readers for the state they
 * record. Those declare the input language, and they come from
 * `tsp-asyncapi-core`. This package's API is the document it emits.
 */

export { $onEmit } from "./emitter.js";

export { $lib, PACKAGE_NAME } from "./lib.js";

// The linter the compiler runs. Rules live in `tsp-asyncapi-core`, since a
// rule reads decorator state that package owns. The compiler builds each
// rule id from the specifier a user loads, so `$linter` must be exported
// here for the ids to read `tsp-asyncapi/<rule>`, not `tsp-asyncapi-core/<rule>`.
export { asyncAPILinter as $linter } from "tsp-asyncapi-core/unstable";

export type { AsyncAPIEmitterOptions, PreviewFeature } from "./emitter-options.js";

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
