/**
 * The MQTT renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.mqtt`. One function covers all three levels. The three MQTT
 * decorators already record their fields under the names the document uses,
 * and each one drops a field that carried nothing or failed a check. So the
 * recorded state is the emitted object, and the renderer adds one thing to
 * it.
 *
 * That one thing is `bindingVersion`. Writing it here rather than in each
 * decorator means raising the constant moves all three levels at once.
 *
 * Nothing here re-checks a value. The presence of a field is decided once,
 * by the decorator that recorded it.
 */

import { MQTT_BINDING_VERSION } from "../../constants.js";
import type {
  MqttMessageBindingState,
  MqttOperationBindingState,
  MqttServerBindingState,
} from "../../decorators/bindings/mqtt/config.js";
import {
  MqttMessageBindingObject,
  MqttOperationBindingObject,
  MqttServerBindingObject,
} from "../../types/index.js";

/**
 * The emitted MQTT object of any one level.
 *
 * The three levels carry different fields, and the renderer never chooses
 * between them. It is the recording decorator that fixes which level a
 * configuration belongs to.
 */
type MqttBindingObject =
  MqttServerBindingObject | MqttOperationBindingObject | MqttMessageBindingObject;

type MqttBindingState =
  MqttServerBindingState | MqttOperationBindingState | MqttMessageBindingState;

/**
 * Renders the `mqtt` member of one Bindings Object.
 *
 * @param config - The configuration an MQTT decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderMqttBinding(config: unknown): MqttBindingObject {
  // The parameter is `unknown` because the caller holds a map of renderers
  // that all share one signature. The narrowing happens here, and it is what
  // makes the return type mean anything.
  return { ...(config as MqttBindingState), bindingVersion: MQTT_BINDING_VERSION };
}
