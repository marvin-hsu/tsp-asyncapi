/**
 * The Bindings Objects of the AsyncAPI document.
 *
 * AsyncAPI puts a Bindings Object on a server, a channel, an operation, and a
 * message. Each holds one member per protocol, and each protocol defines its
 * own shape for that member.
 *
 * The protocol-specific types live here rather than beside the core document
 * objects. There is one protocol today and four more planned, so this family
 * grows on its own schedule and would otherwise interrupt the order the
 * specification lists the core objects in.
 */

import { SchemaObject } from "./document.js";

/**
 * The protocol-specific settings of one object, keyed by protocol name.
 * @public
 */
export type BindingsObject = Record<string, BindingObject>;

/**
 * The settings one protocol defines for one object.
 * @public
 */
export type BindingObject = Record<string, unknown>;

/**
 * The Kafka settings of one server.
 * @public
 */
export interface KafkaServerBindingObject {
  /** The URL of the schema registry the server uses. */
  schemaRegistryUrl?: string;
  /** The vendor of that registry, such as `confluent`. */
  schemaRegistryVendor?: string;
  /** The version of the Kafka binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Kafka settings of one channel.
 * @public
 */
export interface KafkaChannelBindingObject {
  /** The topic name, when it differs from the channel address. */
  topic?: string;
  /** The number of partitions of the topic. */
  partitions?: number;
  /** The number of replicas of the topic. */
  replicas?: number;
  /** The Kafka topic configuration. */
  topicConfiguration?: Record<string, unknown>;
  /** The version of the Kafka binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Kafka settings of one operation.
 * @public
 */
export interface KafkaOperationBindingObject {
  /** The schema of the consumer group id. */
  groupId?: SchemaObject;
  /** The schema of the consumer client id. */
  clientId?: SchemaObject;
  /** The version of the Kafka binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Kafka settings of one message.
 * @public
 */
export interface KafkaMessageBindingObject {
  /** The schema of the message key. */
  key?: SchemaObject;
  /** Where the schema id sits: `header` or `payload`. */
  schemaIdLocation?: string;
  /** How the schema id is encoded inside the payload. */
  schemaIdPayloadEncoding?: string;
  /** How a consumer looks the schema up. */
  schemaLookupStrategy?: string;
  /** The version of the Kafka binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The WebSocket settings of one channel.
 *
 * The WebSocket binding defines this one object and nothing else. Its own
 * text says the server, operation and message bindings must carry no
 * property at all. A WebSocket connection is opened once, so everything the
 * binding has to say is said about the channel.
 * @public
 */
export interface WebSocketChannelBindingObject {
  /** The HTTP method that opens the connection: `GET` or `POST`. */
  method?: string;
  /** The query parameters of the handshake, as a Schema Object. */
  query?: SchemaObject;
  /** The headers of the handshake, as a Schema Object. */
  headers?: SchemaObject;
  /** The version of the WebSocket binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Last Will and Testament of one MQTT server.
 *
 * The broker sends this message when the client goes away without saying
 * goodbye.
 * @public
 */
export interface MqttLastWillObject {
  /** The topic the message is sent to. */
  topic?: string;
  /** How hard the broker tries to deliver it: `0`, `1` or `2`. */
  qos?: number;
  /** The message itself. */
  message?: string;
  /** Whether the broker retains the message. */
  retain?: boolean;
}

/**
 * The MQTT settings of one server.
 *
 * `sessionExpiryInterval` and `maximumPacketSize` are MQTT 5 fields. The
 * binding types each one as a number or a Schema Object, so both reach the
 * document as the author wrote them.
 * @public
 */
export interface MqttServerBindingObject {
  /** The client identifier. */
  clientId?: string;
  /** Whether the connection starts a new session. */
  cleanSession?: boolean;
  /** The Last Will and Testament configuration. */
  lastWill?: MqttLastWillObject;
  /** The number of seconds between two control packets. */
  keepAlive?: number;
  /** How long a session outlives its connection. */
  sessionExpiryInterval?: number | SchemaObject;
  /** The largest packet the client accepts. */
  maximumPacketSize?: number | SchemaObject;
  /** The version of the MQTT binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The MQTT settings of one operation.
 * @public
 */
export interface MqttOperationBindingObject {
  /** How hard the broker tries to deliver: `0`, `1` or `2`. */
  qos?: number;
  /** Whether the broker retains the message. */
  retain?: boolean;
  /** How long the message stays valid. An MQTT 5 field. */
  messageExpiryInterval?: number | SchemaObject;
  /** The version of the MQTT binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The MQTT settings of one message.
 *
 * All four fields are MQTT 5 fields.
 * @public
 */
export interface MqttMessageBindingObject {
  /** Whether the payload is bytes (`0`) or UTF-8 (`1`). */
  payloadFormatIndicator?: number;
  /** The data a reply carries back to match it with its request. */
  correlationData?: SchemaObject;
  /** The media type of the payload. */
  contentType?: string;
  /** The topic a reply is sent to. It is a name, or a schema describing one. */
  responseTopic?: string | SchemaObject;
  /** The version of the MQTT binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The HTTP settings of one operation.
 * @public
 */
export interface HttpOperationBindingObject {
  /** The HTTP method of the request, such as `POST`. */
  method?: string;
  /** The query parameters of the request, as a Schema Object. */
  query?: SchemaObject;
  /** The version of the HTTP binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The HTTP settings of one message.
 * @public
 */
export interface HttpMessageBindingObject {
  /** The HTTP headers of the message, as a Schema Object. */
  headers?: SchemaObject;
  /** The response status code. It applies to a reply message only. */
  statusCode?: number;
  /** The version of the HTTP binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The AMQP exchange one channel is bound to.
 * @public
 */
export interface AmqpExchangeObject {
  /** The name of the exchange. */
  name?: string;
  /** The type of the exchange, such as `topic`. */
  type?: string;
  /** Whether the exchange outlives a broker restart. */
  durable?: boolean;
  /** Whether the broker deletes the exchange when the last queue leaves. */
  autoDelete?: boolean;
  /** The virtual host of the exchange. */
  vhost?: string;
}

/**
 * The AMQP queue one channel is bound to.
 * @public
 */
export interface AmqpQueueObject {
  /** The name of the queue. */
  name?: string;
  /** Whether the queue outlives a broker restart. */
  durable?: boolean;
  /** Whether one connection alone may use the queue. */
  exclusive?: boolean;
  /** Whether the broker deletes the queue when the last consumer leaves. */
  autoDelete?: boolean;
  /** The virtual host of the queue. */
  vhost?: string;
}

/**
 * The AMQP settings of one channel.
 * @public
 */
export interface AmqpChannelBindingObject {
  /** What the channel is: `queue` or `routingKey`. */
  is?: string;
  /** The exchange the channel is bound to. */
  exchange?: AmqpExchangeObject;
  /** The queue the channel is bound to. */
  queue?: AmqpQueueObject;
  /** The version of the AMQP binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The AMQP settings of one operation.
 * @public
 */
export interface AmqpOperationBindingObject {
  /** How long the message stays in the queue, in milliseconds. */
  expiration?: number;
  /** The user who sent the message. */
  userId?: string;
  /** The routing keys the message is also sent to. */
  cc?: string[];
  /** The priority of the message. */
  priority?: number;
  /** Whether the message is persisted: `1` is transient, `2` is persistent. */
  deliveryMode?: number;
  /** Whether the message must be routed to a queue. */
  mandatory?: boolean;
  /** The routing keys the message is also sent to, without being listed. */
  bcc?: string[];
  /** Whether the broker timestamps the message. */
  timestamp?: boolean;
  /** Whether the consumer acknowledges the message. */
  ack?: boolean;
  /** The version of the AMQP binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The AMQP settings of one message.
 * @public
 */
export interface AmqpMessageBindingObject {
  /** The encoding of the payload, such as `gzip`. */
  contentEncoding?: string;
  /** The application-specific type of the message. */
  messageType?: string;
  /** The version of the AMQP binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The NATS settings of one operation.
 *
 * NATS defines this one object and nothing else.
 * @public
 */
export interface NatsOperationBindingObject {
  /** The queue group the subscription joins. */
  queue?: string;
  /** The version of the NATS binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Pulsar settings of one server.
 * @public
 */
export interface PulsarServerBindingObject {
  /** The tenant the server belongs to. */
  tenant?: string;
  /** The version of the Pulsar binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * How long Pulsar keeps a message on one topic.
 *
 * Zero disables retention on that measure. The two are independent, so a
 * topic may bound one of them and leave the other open.
 * @public
 */
export interface PulsarRetentionObject {
  /** The time in minutes. */
  time?: number;
  /** The size in megabytes. */
  size?: number;
}

/**
 * The Pulsar settings of one channel.
 *
 * `namespace` and `persistence` are required. Together they say where the
 * topic lives and whether it survives a broker restart.
 * @public
 */
export interface PulsarChannelBindingObject {
  /** The namespace the topic lives in. */
  namespace: string;
  /** Whether the topic is `persistent` or `non-persistent`. */
  persistence: string;
  /** The compaction threshold in megabytes. */
  compaction?: number;
  /** The clusters the topic is replicated to. */
  "geo-replication"?: string[];
  /** How long a message is kept. */
  retention?: PulsarRetentionObject;
  /** The time to live in seconds. */
  ttl?: number;
  /** Whether the broker drops a repeated message. */
  deduplication?: boolean;
  /** The version of the Pulsar binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * Where a Google Cloud Pub/Sub topic keeps its messages.
 * @public
 */
export interface GooglePubSubStoragePolicyObject {
  /** The regions the messages may be stored in. */
  allowedPersistenceRegions?: string[];
}

/**
 * The schema one Google Cloud Pub/Sub topic validates against.
 *
 * `encoding` and `name` are both required.
 * @public
 */
export interface GooglePubSubSchemaSettingsObject {
  /** How the message is encoded, such as `json` or `binary`. */
  encoding: string;
  /** The name of the schema resource. */
  name: string;
  /** The oldest revision the topic accepts. */
  firstRevisionId?: string;
  /** The newest revision the topic accepts. */
  lastRevisionId?: string;
}

/**
 * The Google Cloud Pub/Sub settings of one channel.
 *
 * `schemaSettings` is required.
 * @public
 */
export interface GooglePubSubChannelBindingObject {
  /** The schema the topic validates against. */
  schemaSettings: GooglePubSubSchemaSettingsObject;
  /** The labels of the topic. */
  labels?: Record<string, unknown>;
  /** How long a message is kept, such as `86400s`. */
  messageRetentionDuration?: string;
  /** Where the messages are stored. */
  messageStoragePolicy?: GooglePubSubStoragePolicyObject;
  /** The version of the binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The schema one Google Cloud Pub/Sub message names.
 * @public
 */
export interface GooglePubSubSchemaObject {
  /** The name of the schema resource. */
  name: string;
}

/**
 * The Google Cloud Pub/Sub settings of one message.
 * @public
 */
export interface GooglePubSubMessageBindingObject {
  /** The attributes carried alongside the payload. */
  attributes?: Record<string, unknown>;
  /** The key that orders messages within one region. */
  orderingKey?: string;
  /** The schema the message validates against. */
  schema?: GooglePubSubSchemaObject;
  /** The version of the binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * One Amazon SQS queue.
 *
 * `name` and `fifoQueue` are both required on a channel binding. AsyncAPI
 * requires only `name` on an operation binding, and this emitter follows each
 * one where it applies.
 * @public
 */
export interface SqsQueueObject {
  /** The name of the queue. */
  name: string;
  /** Whether the queue keeps the order messages arrived in. */
  fifoQueue?: boolean;
  /** What deduplication applies to: `queue` or `messageGroup`. */
  deduplicationScope?: string;
  /** How throughput is counted: `perQueue` or `perMessageGroupId`. */
  fifoThroughputLimit?: string;
  /** How long delivery is held back, in seconds. */
  deliveryDelay?: number;
  /** How long a read message stays hidden, in seconds. */
  visibilityTimeout?: number;
  /** How long a receive call waits, in seconds. */
  receiveMessageWaitTime?: number;
  /** How long a message is kept, in seconds. */
  messageRetentionPeriod?: number;
  /** What happens to a message that cannot be processed. */
  redrivePolicy?: Record<string, unknown>;
  /** The access policy of the queue. */
  policy?: Record<string, unknown>;
  /** The tags of the queue. */
  tags?: Record<string, unknown>;
}

/**
 * The Amazon SQS settings of one channel.
 *
 * `queue` is required.
 * @public
 */
export interface SqsChannelBindingObject {
  /** The queue the channel is. */
  queue: SqsQueueObject;
  /** The queue that receives a message which cannot be processed. */
  deadLetterQueue?: SqsQueueObject;
  /** The version of the SQS binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Amazon SQS settings of one operation.
 *
 * `queues` is required.
 * @public
 */
export interface SqsOperationBindingObject {
  /** The queues the operation reads from or writes to. */
  queues: SqsQueueObject[];
  /** The version of the SQS binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Anypoint MQ settings of one channel.
 * @public
 */
export interface AnypointMqChannelBindingObject {
  /** The name of the destination. */
  destination?: string;
  /** What the destination is: `exchange`, `queue` or `fifo-queue`. */
  destinationType?: string;
  /** The version of the binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Anypoint MQ settings of one message.
 * @public
 */
export interface AnypointMqMessageBindingObject {
  /** The protocol headers of the message, as a Schema Object. */
  headers?: SchemaObject;
  /** The version of the binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The JMS settings of one server.
 *
 * `jmsConnectionFactory` is required.
 * @public
 */
export interface JmsServerBindingObject {
  /** The class name of the connection factory. */
  jmsConnectionFactory: string;
  /** The vendor-specific properties of the connection. */
  properties?: unknown[];
  /** The client identifier of the connection. */
  clientID?: string;
  /** The version of the JMS binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The JMS settings of one channel.
 * @public
 */
export interface JmsChannelBindingObject {
  /** The name of the destination. */
  destination?: string;
  /** What the destination is: `queue` or `fifo-queue`. */
  destinationType?: string;
  /** The version of the JMS binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The JMS settings of one message.
 * @public
 */
export interface JmsMessageBindingObject {
  /** The headers of the message, as a Schema Object. */
  headers?: SchemaObject;
  /** The version of the JMS binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The IBM MQ settings of one server.
 * @public
 */
export interface IbmMqServerBindingObject {
  /** The name of the queue manager group. */
  groupId?: string;
  /** The queue manager named in the client channel definition table. */
  ccdtQueueManagerName?: string;
  /** The cipher specification of the TLS connection. */
  cipherSpec?: string;
  /** Whether the server names more than one endpoint. */
  multiEndpointServer?: boolean;
  /** The seconds between two heartbeats. */
  heartBeatInterval?: number;
  /** The version of the IBM MQ binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The IBM MQ settings of one channel.
 * @public
 */
export interface IbmMqChannelBindingObject {
  /** What the destination is: `topic` or `queue`. */
  destinationType?: string;
  /** The queue the channel is bound to. */
  queue?: Record<string, unknown>;
  /** The topic the channel is bound to. */
  topic?: Record<string, unknown>;
  /** The largest message the channel carries, in bytes. */
  maxMsgLength?: number;
  /** The version of the IBM MQ binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The IBM MQ settings of one message.
 * @public
 */
export interface IbmMqMessageBindingObject {
  /** The kind of payload: `string`, `jms` or `binary`. */
  type?: string;
  /** The headers the message carries, as a comma-separated list. */
  headers?: string;
  /** What the message describes. */
  description?: string;
  /** How long the message stays valid, in milliseconds. */
  expiry?: number;
  /** The version of the IBM MQ binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Solace settings of one server.
 * @public
 */
export interface SolaceServerBindingObject {
  /** The message VPN the client connects to. */
  msgVpn?: string;
  /** The name the client connects under. */
  clientName?: string;
  /** The version of the Solace binding specification these fields follow. */
  bindingVersion: string;
}

/**
 * The Solace settings of one operation.
 * @public
 */
export interface SolaceOperationBindingObject {
  /** Where the operation sends to or reads from. */
  destinations?: Record<string, unknown>[];
  /** How long a message stays valid, in milliseconds. */
  timeToLive?: number;
  /** The priority of the message. */
  priority?: number;
  /** Whether an undeliverable message goes to the dead message queue. */
  dmqEligible?: boolean;
  /** The version of the Solace binding specification these fields follow. */
  bindingVersion: string;
}
