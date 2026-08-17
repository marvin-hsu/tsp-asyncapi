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
