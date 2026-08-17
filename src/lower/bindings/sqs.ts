/**
 * The Amazon SQS renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.sqs`. One function covers both levels. The decorators already
 * record their fields under the names the document uses, so the renderer adds
 * one thing: `bindingVersion`.
 */

import { SQS_BINDING_VERSION } from "../../constants.js";
import type {
  SqsChannelBindingState,
  SqsOperationBindingState,
} from "../../decorators/bindings/sqs/config.js";
import { SqsChannelBindingObject, SqsOperationBindingObject } from "../../types/index.js";

/** The emitted SQS object of either level. */
type SqsBindingObject = SqsChannelBindingObject | SqsOperationBindingObject;

type SqsBindingState = SqsChannelBindingState | SqsOperationBindingState;

/**
 * Renders the `sqs` member of one Bindings Object.
 *
 * @param config - The configuration an SQS decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderSqsBinding(config: unknown): SqsBindingObject {
  return { ...(config as SqsBindingState), bindingVersion: SQS_BINDING_VERSION };
}
