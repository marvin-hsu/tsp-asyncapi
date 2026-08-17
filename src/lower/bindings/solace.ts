/**
 * The Solace renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.solace`. One function covers both levels. The decorators already
 * record their fields under the names the document uses, so the renderer adds
 * one thing: `bindingVersion`.
 */

import { SOLACE_BINDING_VERSION } from "../../constants.js";
import type {
  SolaceOperationBindingState,
  SolaceServerBindingState,
} from "../../decorators/bindings/solace/index.js";
import { SolaceOperationBindingObject, SolaceServerBindingObject } from "../../types/index.js";

/** The emitted Solace object of either level. */
type SolaceBindingObject = SolaceServerBindingObject | SolaceOperationBindingObject;

type SolaceBindingState = SolaceServerBindingState | SolaceOperationBindingState;

/**
 * Renders the `solace` member of one Bindings Object.
 *
 * @param config - The configuration a Solace decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderSolaceBinding(config: unknown): SolaceBindingObject {
  return { ...(config as SolaceBindingState), bindingVersion: SOLACE_BINDING_VERSION };
}
