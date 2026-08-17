/**
 * The Anypoint MQ renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.anypointmq`. One function covers both levels. The decorators
 * already record their fields under the names the document uses, so the
 * renderer adds one thing: `bindingVersion`.
 */

import { ANYPOINT_MQ_BINDING_VERSION } from "../../constants.js";
import type {
  AnypointMqChannelBindingState,
  AnypointMqMessageBindingState,
} from "../../decorators/bindings/anypointmq/index.js";
import {
  AnypointMqChannelBindingObject,
  AnypointMqMessageBindingObject,
} from "../../types/index.js";

/** The emitted Anypoint MQ object of either level. */
type AnypointMqBindingObject = AnypointMqChannelBindingObject | AnypointMqMessageBindingObject;

type AnypointMqBindingState = AnypointMqChannelBindingState | AnypointMqMessageBindingState;

/**
 * Renders the `anypointmq` member of one Bindings Object.
 *
 * @param config - The configuration an Anypoint MQ decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderAnypointMqBinding(config: unknown): AnypointMqBindingObject {
  return {
    ...(config as AnypointMqBindingState),
    bindingVersion: ANYPOINT_MQ_BINDING_VERSION,
  };
}
