/**
 * The JMS renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.jms`. One function covers all three levels. The decorators
 * already record their fields under the names the document uses, so the
 * renderer adds one thing: `bindingVersion`.
 */

import { JMS_BINDING_VERSION } from "../../constants.js";
import type {
  JmsChannelBindingState,
  JmsMessageBindingState,
  JmsServerBindingState,
} from "../../decorators/bindings/jms/index.js";
import {
  JmsChannelBindingObject,
  JmsMessageBindingObject,
  JmsServerBindingObject,
} from "../../types/index.js";

/** The emitted JMS object of any one level. */
type JmsBindingObject = JmsServerBindingObject | JmsChannelBindingObject | JmsMessageBindingObject;

type JmsBindingState = JmsServerBindingState | JmsChannelBindingState | JmsMessageBindingState;

/**
 * Renders the `jms` member of one Bindings Object.
 *
 * @param config - The configuration a JMS decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderJmsBinding(config: unknown): JmsBindingObject {
  return { ...(config as JmsBindingState), bindingVersion: JMS_BINDING_VERSION };
}
