/**
 * The `@amqpMessage` decorator: the AMQP message binding.
 *
 * It lands in `components.messages.<key>.bindings.amqp`. Field checks live
 * in the sibling `config.ts`. `state.ts` claims the slot once the fields
 * are checked.
 */

import { DecoratorContext, Model } from "@typespec/compiler";
import { AMQP_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { AmqpMessageBindingState } from "./config.js";

/**
 * The `config` argument of `@amqpMessage`, as the author wrote it.
 * @public
 */
export interface AmqpMessageBindingConfig {
  /** The encoding of the payload, such as `gzip`. */
  contentEncoding?: string;
  /** The application-specific type of the message. */
  messageType?: string;
}

/**
 * Adds the AMQP message binding to one message.
 *
 * The emitted object lands in `components.messages.<key>.bindings.amqp`, and
 * it always carries the `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`. A model without one is
 * reported once the document is built.
 *
 * Both fields are free text. AMQP states no set of values for either one, so
 * neither is checked beyond being non-blank.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param config - The AMQP message binding fields
 *
 * @example
 * ```typespec
 * @amqpMessage(#{ contentEncoding: "gzip", messageType: "event.created" })
 * @message
 * model EventCreated {
 *   id: string;
 * }
 * ```
 *
 * @public
 */
export function $amqpMessage(
  context: DecoratorContext,
  target: Model,
  config: AmqpMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: AmqpMessageBindingState = {
    ...present("contentEncoding", trimmed(config.contentEncoding)),
    ...present("messageType", trimmed(config.messageType)),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: AMQP_BINDING_PROTOCOL,
    renderer: "amqp",
    config: state,
    node: configTarget,
  });
}
