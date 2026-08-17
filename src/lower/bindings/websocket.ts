/**
 * The WebSocket renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.ws`. The decorator already records its fields under the names
 * the document uses, and it drops a field that carried nothing or failed a
 * check. So the recorded state is the emitted object, and the renderer adds
 * one thing to it.
 *
 * That one thing is `bindingVersion`. Writing it here rather than in the
 * decorator means raising the constant moves the whole protocol at once.
 *
 * Nothing here re-checks a value. The presence of a field is decided once,
 * by the decorator that recorded it.
 */

import { WEBSOCKET_BINDING_VERSION } from "../../constants.js";
import type { WebSocketChannelBindingState } from "../../decorators/bindings/websocket.js";
import { WebSocketChannelBindingObject } from "../../types/index.js";

/**
 * Renders the `ws` member of one Bindings Object.
 *
 * @param config - The configuration `@websocketChannel` recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderWebSocketBinding(config: unknown): WebSocketChannelBindingObject {
  // The parameter is `unknown` because the caller holds a map of renderers
  // that all share one signature. The narrowing happens here, and it is what
  // makes the return type mean anything.
  return {
    ...(config as WebSocketChannelBindingState),
    bindingVersion: WEBSOCKET_BINDING_VERSION,
  };
}
