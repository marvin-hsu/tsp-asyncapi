/**
 * The HTTP renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.http`. One function covers both levels. The two HTTP decorators
 * already record their fields under the names the document uses, and each one
 * drops a field that carried nothing or failed a check. So the recorded state
 * is the emitted object, and the renderer adds one thing to it.
 *
 * That one thing is `bindingVersion`. Writing it here rather than in each
 * decorator means raising the constant moves both levels at once.
 */

import { HTTP_BINDING_VERSION } from "../../constants.js";
import type { HttpMessageBindingState } from "../../decorators/bindings/http/message.js";
import type { HttpOperationBindingState } from "../../decorators/bindings/http/operation.js";
import { HttpMessageBindingObject, HttpOperationBindingObject } from "../../types/index.js";

/** The emitted HTTP object of either level. */
type HttpBindingObject = HttpOperationBindingObject | HttpMessageBindingObject;

type HttpBindingState = HttpOperationBindingState | HttpMessageBindingState;

/**
 * Renders the `http` member of one Bindings Object.
 *
 * @param config - The configuration an HTTP decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderHttpBinding(config: unknown): HttpBindingObject {
  // The parameter is `unknown` because the caller holds a map of renderers
  // that all share one signature. The narrowing happens here.
  return { ...(config as HttpBindingState), bindingVersion: HTTP_BINDING_VERSION };
}
