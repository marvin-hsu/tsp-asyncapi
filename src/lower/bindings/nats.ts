/**
 * The NATS renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.nats`. The decorator already records its field under the name the
 * document uses, so the renderer adds one thing: `bindingVersion`.
 */

import { NATS_BINDING_VERSION } from "../../constants.js";
import type { NatsOperationBindingState } from "../../decorators/bindings/nats.js";
import { NatsOperationBindingObject } from "../../types/index.js";

/**
 * Renders the `nats` member of one Bindings Object.
 *
 * @param config - The configuration `@natsOperation` recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderNatsBinding(config: unknown): NatsOperationBindingObject {
  return { ...(config as NatsOperationBindingState), bindingVersion: NATS_BINDING_VERSION };
}
