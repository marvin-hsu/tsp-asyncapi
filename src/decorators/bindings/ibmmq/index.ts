/**
 * The IBM MQ bindings.
 *
 * IBM MQ defines a server, a channel and a message object. No field of any of
 * them is required.
 *
 * Three fields carry a range rather than a set of values. IBM MQ states each
 * range, and a value outside one names a setting the queue manager refuses.
 */

import {
  DecoratorContext,
  DiagnosticTarget,
  Interface,
  Model,
  Namespace,
} from "@typespec/compiler";
import { IBM_MQ_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { isPlainObject, toPlainValue } from "../../../marshalled-values.js";
import {
  IbmMqChannelBindingObject,
  IbmMqMessageBindingObject,
  IbmMqServerBindingObject,
} from "../../../types/index.js";
import { enumeratedField, reportBindingField } from "../fields.js";
import { claimBinding } from "../state.js";

/** @internal */
export type IbmMqServerBindingState = Omit<IbmMqServerBindingObject, "bindingVersion">;

/** @internal */
export type IbmMqChannelBindingState = Omit<IbmMqChannelBindingObject, "bindingVersion">;

/** @internal */
export type IbmMqMessageBindingState = Omit<IbmMqMessageBindingObject, "bindingVersion">;

/** The two kinds of destination IBM MQ defines. */
const DESTINATION_TYPES = ["topic", "queue"];

/** The three payload kinds IBM MQ defines. */
const MESSAGE_TYPES = ["string", "jms", "binary"];

/** The seconds a heartbeat interval may hold. */
const HEARTBEAT_RANGE = { lowest: 0, highest: 999999 };

/** The bytes a message may hold, which is 100 MB. */
const MAX_MSG_LENGTH_RANGE = { lowest: 0, highest: 104857600 };

/** Checks one field IBM MQ states as a range. */
function inRange(
  context: DecoratorContext,
  field: string,
  value: number | undefined,
  range: { lowest: number; highest: number },
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (value < range.lowest || value > range.highest) {
    reportBindingField(
      context,
      IBM_MQ_BINDING_PROTOCOL,
      field,
      `a value from ${String(range.lowest)} to ${String(range.highest)}`,
      target,
    );
    return undefined;
  }
  return value;
}

/** Reads one sub-object of the channel binding, dropping an empty one. */
function subObject(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!isPlainObject(plain)) {
    reportBindingField(context, IBM_MQ_BINDING_PROTOCOL, field, "an object", target);
    return undefined;
  }
  return Object.keys(plain).length > 0 ? plain : undefined;
}

/**
 * The `config` argument of `@ibmMqServer`, as the author wrote it.
 * @public
 */
export interface IbmMqServerBindingConfig {
  /** The name of the queue manager group. */
  groupId?: string;
  /** The queue manager named in the client channel definition table. */
  ccdtQueueManagerName?: string;
  /** The cipher specification of the TLS connection. */
  cipherSpec?: string;
  /** Whether the server names more than one endpoint. */
  multiEndpointServer?: boolean;
  /** The seconds between two heartbeats, from 0 to 999999. */
  heartBeatInterval?: number;
}

/**
 * Adds the IBM MQ server binding to the servers of one namespace.
 *
 * The emitted object lands in `servers.<name>.bindings.ibmmq`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the service namespace. Every server that namespace declares
 * gets its own copy, for the same reason `@kafkaServer` works that way.
 *
 * `heartBeatInterval` is from 0 to 999999 seconds. A value outside that is
 * reported and dropped, and the rest of the binding is kept.
 *
 * IBM MQ states that `cipherSpec` applies only when the server uses TLS. This
 * emitter does not check that, because the rule spans two objects.
 *
 * @param context - The decorator context
 * @param target - The service namespace
 * @param config - The IBM MQ server binding fields
 *
 * @example
 * ```typespec
 * @ibmMqServer(#{ groupId: "PRODCLSTR1", heartBeatInterval: 300 })
 * @server("production", #{ host: "mq.example.com:1414", protocol: "ibmmq" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $ibmMqServer(
  context: DecoratorContext,
  target: Namespace,
  config: IbmMqServerBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: IbmMqServerBindingState = {
    ...present("groupId", trimmed(config.groupId)),
    ...present("ccdtQueueManagerName", trimmed(config.ccdtQueueManagerName)),
    ...present("cipherSpec", trimmed(config.cipherSpec)),
    ...present("multiEndpointServer", config.multiEndpointServer),
    ...present(
      "heartBeatInterval",
      inRange(
        context,
        "heartBeatInterval",
        config.heartBeatInterval,
        HEARTBEAT_RANGE,
        configTarget,
      ),
    ),
  };

  claimBinding(context, {
    level: "server",
    target,
    protocol: IBM_MQ_BINDING_PROTOCOL,
    renderer: "ibmmq",
    config: state,
    node: configTarget,
  });
}

/**
 * The `config` argument of `@ibmMqChannel`, as the author wrote it.
 * @public
 */
export interface IbmMqChannelBindingConfig {
  /** What the destination is: `topic` or `queue`. */
  destinationType?: string;
  /** The queue the channel is bound to. */
  queue?: unknown;
  /** The topic the channel is bound to. */
  topic?: unknown;
  /** The largest message the channel carries, from 0 to 104857600 bytes. */
  maxMsgLength?: number;
}

/**
 * Adds the IBM MQ channel binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.ibmmq`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`.
 *
 * `destinationType` is `topic` or `queue`, and it says which of the two other
 * fields describes the channel. IBM MQ states that `queue` applies only when
 * the type is `queue`, and `topic` only when it is `topic`. This emitter does
 * not check that pairing, the same way it leaves the AMQP one alone.
 *
 * `maxMsgLength` is from 0 to 104857600 bytes, which is 100 MB.
 *
 * @param context - The decorator context
 * @param target - The channel interface or namespace
 * @param config - The IBM MQ channel binding fields
 *
 * @example
 * ```typespec
 * @ibmMqChannel(#{
 *   destinationType: "queue",
 *   queue: #{ objectName: "ORDERS.QUEUE" }
 * })
 * @channel("orders")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $ibmMqChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: IbmMqChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: IbmMqChannelBindingState = {
    ...present(
      "destinationType",
      enumeratedField(
        context,
        IBM_MQ_BINDING_PROTOCOL,
        "destinationType",
        config.destinationType,
        DESTINATION_TYPES,
        configTarget,
      ),
    ),
    ...present("queue", subObject(context, "queue", config.queue, configTarget)),
    ...present("topic", subObject(context, "topic", config.topic, configTarget)),
    ...present(
      "maxMsgLength",
      inRange(context, "maxMsgLength", config.maxMsgLength, MAX_MSG_LENGTH_RANGE, configTarget),
    ),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: IBM_MQ_BINDING_PROTOCOL,
    renderer: "ibmmq",
    config: state,
    node: configTarget,
  });
}

/**
 * The `config` argument of `@ibmMqMessage`, as the author wrote it.
 * @public
 */
export interface IbmMqMessageBindingConfig {
  /** The kind of payload: `string`, `jms` or `binary`. */
  type?: string;
  /** The headers the message carries, as a comma-separated list. */
  headers?: string;
  /** What the message describes. */
  description?: string;
  /** How long the message stays valid, in milliseconds. */
  expiry?: number;
}

/**
 * Adds the IBM MQ message binding to one message.
 *
 * The emitted object lands in `components.messages.<key>.bindings.ibmmq`, and
 * it always carries the `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`.
 *
 * `type` is `string`, `jms` or `binary`. `expiry` is a number of
 * milliseconds, so it is never negative. Zero means the message never
 * expires.
 *
 * `headers` is a comma-separated list of header names, not a Schema Object.
 * IBM MQ is the one binding in this library that states the field that way.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param config - The IBM MQ message binding fields
 *
 * @example
 * ```typespec
 * @ibmMqMessage(#{ type: "jms", expiry: 60000 })
 * @message
 * model OrderCreated {
 *   id: string;
 * }
 * ```
 *
 * @public
 */
export function $ibmMqMessage(
  context: DecoratorContext,
  target: Model,
  config: IbmMqMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: IbmMqMessageBindingState = {
    ...present(
      "type",
      enumeratedField(
        context,
        IBM_MQ_BINDING_PROTOCOL,
        "type",
        config.type,
        MESSAGE_TYPES,
        configTarget,
      ),
    ),
    ...present("headers", trimmed(config.headers)),
    ...present("description", trimmed(config.description)),
    ...present("expiry", expiry(context, config.expiry, configTarget)),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: IBM_MQ_BINDING_PROTOCOL,
    renderer: "ibmmq",
    config: state,
    node: configTarget,
  });
}

/** Checks the `expiry` field, which IBM MQ states as zero or more. */
function expiry(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (value < 0) {
    reportBindingField(context, IBM_MQ_BINDING_PROTOCOL, "expiry", "zero or more", target);
    return undefined;
  }
  return value;
}
