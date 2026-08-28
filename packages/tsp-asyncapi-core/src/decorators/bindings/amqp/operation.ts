/**
 * The `@amqpOperation` decorator: the AMQP operation binding.
 *
 * It lands in `operations.<key>.bindings.amqp`. Field checks live in the
 * sibling `config.ts`. `state.ts` claims the slot once the fields are
 * checked.
 */

import { DecoratorContext, Operation } from "@typespec/compiler";
import { AMQP_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { AmqpOperationBindingState, deliveryMode, expiration, routingKeys } from "./config.js";

/**
 * The `config` argument of `@amqpOperation`, as the author wrote it.
 * @public
 */
export interface AmqpOperationBindingConfig {
  /** How long the message stays in the queue, in milliseconds. */
  expiration?: number;
  /** The user who sent the message. */
  userId?: string;
  /** The routing keys the message is also sent to. */
  cc?: unknown;
  /** The priority of the message. */
  priority?: number;
  /** Whether the message is persisted: `1` is transient, `2` is persistent. */
  deliveryMode?: number;
  /** Whether the message must be routed to a queue. */
  mandatory?: boolean;
  /** The routing keys the message is also sent to, without being listed. */
  bcc?: unknown;
  /** Whether the broker timestamps the message. */
  timestamp?: boolean;
  /** Whether the consumer acknowledges the message. */
  ack?: boolean;
}

/**
 * Adds the AMQP operation binding to one operation.
 *
 * The emitted object lands in `operations.<key>.bindings.amqp`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to an operation that carries `@send` or `@receive`.
 *
 * `deliveryMode` is `1` for transient and `2` for persistent. `expiration` is
 * a number of milliseconds, so it is never negative. A value outside either
 * rule is reported and dropped, and the rest of the binding is kept.
 *
 * `mandatory`, `bcc`, `timestamp` and `priority` apply to a send. `ack`
 * applies to a receive. AsyncAPI does not check which action the operation
 * carries, and this emitter does not either.
 *
 * @param context - The decorator context
 * @param target - The operation
 * @param config - The AMQP operation binding fields
 *
 * @example
 * ```typespec
 * @amqpOperation(#{ deliveryMode: 2, expiration: 60000, cc: #["events.audit"] })
 * @send
 * op publish(event: EventCreated): void;
 * ```
 *
 * @public
 */
export function $amqpOperation(
  context: DecoratorContext,
  target: Operation,
  config: AmqpOperationBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  // The field order follows the order the binding specification lists them
  // in, so two documents cannot differ by how their author typed a literal.
  const state: AmqpOperationBindingState = {
    ...present("expiration", expiration(context, config.expiration, configTarget)),
    ...present("userId", trimmed(config.userId)),
    ...present("cc", routingKeys(context, "cc", config.cc, configTarget)),
    ...present("priority", config.priority),
    ...present("deliveryMode", deliveryMode(context, config.deliveryMode, configTarget)),
    ...present("mandatory", config.mandatory),
    ...present("bcc", routingKeys(context, "bcc", config.bcc, configTarget)),
    ...present("timestamp", config.timestamp),
    ...present("ack", config.ack),
  };

  claimBinding(context, {
    level: "operation",
    target,
    protocol: AMQP_BINDING_PROTOCOL,
    renderer: "amqp",
    config: state,
    node: configTarget,
  });
}
