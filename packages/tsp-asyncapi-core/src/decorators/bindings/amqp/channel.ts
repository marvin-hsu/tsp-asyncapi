/**
 * The `@amqpChannel` decorator: the AMQP channel binding.
 *
 * It lands in `channels.<key>.bindings.amqp`. Field checks live in the
 * sibling `config.ts`. `state.ts` claims the slot once the fields are
 * checked.
 */

import { DecoratorContext, Interface, Namespace } from "@typespec/compiler";
import { AMQP_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { AmqpChannelBindingState, channelKind, exchange, queue } from "./config.js";

/**
 * The `config` argument of `@amqpChannel`, as the author wrote it.
 * @public
 */
export interface AmqpChannelBindingConfig {
  /** What the channel is: `queue` or `routingKey`. */
  is?: string;
  /** The exchange the channel is bound to. */
  exchange?: unknown;
  /** The queue the channel is bound to. */
  queue?: unknown;
}

/**
 * Adds the AMQP channel binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.amqp`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`.
 *
 * `is` is `queue` or `routingKey`. It says which of the two other fields
 * describes the channel. AsyncAPI does not require the two to agree, and this
 * emitter does not check it either.
 *
 * `is` is also a TypeSpec keyword, so the field name has to be written in
 * backticks. The emitted member is still `is`, which is the name AMQP gives
 * it.
 *
 * `exchange.type` is one of `topic`, `direct`, `fanout`, `default` and
 * `headers`. A name of an exchange or a queue is at most 255 characters.
 * A field outside either rule is reported and dropped, and the rest of the
 * object is kept.
 *
 * @example
 * ```typespec
 * @amqpChannel(#{
 *   `is`: "routingKey",
 *   exchange: #{ name: "events", type: "topic", durable: true }
 * })
 * @channel("events.created")
 * interface EventChannel {}
 * ```
 *
 * @public
 */
export function $amqpChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: AmqpChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: AmqpChannelBindingState = {
    ...present("is", channelKind(context, config.is, configTarget)),
    ...present("exchange", exchange(context, config.exchange, configTarget)),
    ...present("queue", queue(context, config.queue, configTarget)),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: AMQP_BINDING_PROTOCOL,
    renderer: "amqp",
    config: state,
    node: configTarget,
  });
}
