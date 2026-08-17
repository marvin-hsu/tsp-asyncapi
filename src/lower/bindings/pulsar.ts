/**
 * The Pulsar renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.pulsar`. One function covers both levels. The decorators already
 * record their fields under the names the document uses, so the renderer adds
 * one thing: `bindingVersion`.
 */

import { PULSAR_BINDING_VERSION } from "../../constants.js";
import type {
  PulsarChannelBindingState,
  PulsarServerBindingState,
} from "../../decorators/bindings/pulsar/config.js";
import { PulsarChannelBindingObject, PulsarServerBindingObject } from "../../types/index.js";

/** The emitted Pulsar object of either level. */
type PulsarBindingObject = PulsarServerBindingObject | PulsarChannelBindingObject;

type PulsarBindingState = PulsarServerBindingState | PulsarChannelBindingState;

/**
 * Renders the `pulsar` member of one Bindings Object.
 *
 * @param config - The configuration a Pulsar decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderPulsarBinding(config: unknown): PulsarBindingObject {
  return { ...(config as PulsarBindingState), bindingVersion: PULSAR_BINDING_VERSION };
}
