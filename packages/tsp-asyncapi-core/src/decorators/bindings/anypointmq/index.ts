/**
 * The Anypoint MQ bindings.
 *
 * Anypoint MQ defines a channel object and a message object. It defines no
 * server or operation object with fields of its own.
 */

import { DecoratorContext, Interface, Model, Namespace } from "@typespec/compiler";
import { ANYPOINT_MQ_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import type {
  AnypointMqChannelBindingObject,
  AnypointMqMessageBindingObject,
} from "../../../types/index.js";
import { enumeratedField, schemaField } from "../fields.js";
import { claimBinding } from "../state.js";

type AnypointMqChannelBindingState = Omit<AnypointMqChannelBindingObject, "bindingVersion">;

type AnypointMqMessageBindingState = Omit<AnypointMqMessageBindingObject, "bindingVersion">;

/** The three kinds of destination Anypoint MQ defines. */
const DESTINATION_TYPES = ["exchange", "queue", "fifo-queue"];

/**
 * The `config` argument of `@anypointMqChannel`, as the author wrote it.
 * @public
 */
export interface AnypointMqChannelBindingConfig {
  /** The name of the destination. */
  destination?: string;
  /** What the destination is: `exchange`, `queue` or `fifo-queue`. */
  destinationType?: string;
}

/**
 * Adds the Anypoint MQ channel binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.anypointmq`, and it
 * always carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`.
 *
 * `destinationType` is `exchange`, `queue` or `fifo-queue`. Any other value
 * is reported and dropped.
 *
 * @param context - The decorator context
 * @param target - The channel interface or namespace
 * @param config - The Anypoint MQ channel binding fields
 *
 * @example
 * ```typespec
 * @anypointMqChannel(#{ destination: "orders", destinationType: "queue" })
 * @channel("orders")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $anypointMqChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: AnypointMqChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: AnypointMqChannelBindingState = {
    ...present("destination", trimmed(config.destination)),
    ...present(
      "destinationType",
      enumeratedField(
        context,
        ANYPOINT_MQ_BINDING_PROTOCOL,
        "destinationType",
        config.destinationType,
        DESTINATION_TYPES,
        configTarget,
      ),
    ),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: ANYPOINT_MQ_BINDING_PROTOCOL,
    renderer: "anypointmq",
    config: state,
    node: configTarget,
  });
}

/**
 * The `config` argument of `@anypointMqMessage`, as the author wrote it.
 * @public
 */
export interface AnypointMqMessageBindingConfig {
  /** The protocol headers of the message, as a Schema Object. */
  headers?: unknown;
}

/**
 * Adds the Anypoint MQ message binding to one message.
 *
 * The emitted object lands in
 * `components.messages.<key>.bindings.anypointmq`, and it always carries the
 * `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`.
 *
 * `headers` is a Schema Object. Anypoint MQ states no rule about its shape,
 * unlike the HTTP and WebSocket bindings, so only the object itself is
 * checked.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param config - The Anypoint MQ message binding fields
 *
 * @example
 * ```typespec
 * @anypointMqMessage(#{ headers: #{ type: "object" } })
 * @message
 * model OrderCreated {
 *   id: string;
 * }
 * ```
 *
 * @public
 */
export function $anypointMqMessage(
  context: DecoratorContext,
  target: Model,
  config: AnypointMqMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: AnypointMqMessageBindingState = {
    ...present(
      "headers",
      schemaField(context, ANYPOINT_MQ_BINDING_PROTOCOL, "headers", config.headers, configTarget),
    ),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: ANYPOINT_MQ_BINDING_PROTOCOL,
    renderer: "anypointmq",
    config: state,
    node: configTarget,
  });
}
