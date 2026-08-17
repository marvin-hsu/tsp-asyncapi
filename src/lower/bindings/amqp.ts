/**
 * The AMQP renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.amqp`. One function covers all three levels. The three AMQP
 * decorators already record their fields under the names the document uses,
 * and each one drops a field that carried nothing or failed a check. So the
 * recorded state is the emitted object, and the renderer adds one thing to
 * it.
 *
 * That one thing is `bindingVersion`. Writing it here rather than in each
 * decorator means raising the constant moves all three levels at once.
 */

import { AMQP_BINDING_VERSION } from "../../constants.js";
import type {
  AmqpChannelBindingState,
  AmqpMessageBindingState,
  AmqpOperationBindingState,
} from "../../decorators/bindings/amqp/config.js";
import {
  AmqpChannelBindingObject,
  AmqpMessageBindingObject,
  AmqpOperationBindingObject,
} from "../../types/index.js";

/** The emitted AMQP object of any one level. */
type AmqpBindingObject =
  AmqpChannelBindingObject | AmqpOperationBindingObject | AmqpMessageBindingObject;

type AmqpBindingState =
  AmqpChannelBindingState | AmqpOperationBindingState | AmqpMessageBindingState;

/**
 * Renders the `amqp` member of one Bindings Object.
 *
 * @param config - The configuration an AMQP decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderAmqpBinding(config: unknown): AmqpBindingObject {
  // The parameter is `unknown` because the caller holds a map of renderers
  // that all share one signature. The narrowing happens here.
  return { ...(config as AmqpBindingState), bindingVersion: AMQP_BINDING_VERSION };
}
