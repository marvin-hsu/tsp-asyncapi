/**
 * The IBM MQ renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.ibmmq`. One function covers all three levels. The decorators
 * already record their fields under the names the document uses, so the
 * renderer adds one thing: `bindingVersion`.
 */

import { IBM_MQ_BINDING_VERSION } from "../../constants.js";
import type {
  IbmMqChannelBindingState,
  IbmMqMessageBindingState,
  IbmMqServerBindingState,
} from "../../decorators/bindings/ibmmq/index.js";
import {
  IbmMqChannelBindingObject,
  IbmMqMessageBindingObject,
  IbmMqServerBindingObject,
} from "../../types/index.js";

/** The emitted IBM MQ object of any one level. */
type IbmMqBindingObject =
  IbmMqServerBindingObject | IbmMqChannelBindingObject | IbmMqMessageBindingObject;

type IbmMqBindingState =
  IbmMqServerBindingState | IbmMqChannelBindingState | IbmMqMessageBindingState;

/**
 * Renders the `ibmmq` member of one Bindings Object.
 *
 * @param config - The configuration an IBM MQ decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderIbmMqBinding(config: unknown): IbmMqBindingObject {
  return { ...(config as IbmMqBindingState), bindingVersion: IBM_MQ_BINDING_VERSION };
}
