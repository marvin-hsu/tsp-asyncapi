/**
 * The Google Cloud Pub/Sub renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.googlepubsub`. One function covers both levels. The decorators
 * already record their fields under the names the document uses, so the
 * renderer adds one thing: `bindingVersion`.
 */

import { GOOGLE_PUB_SUB_BINDING_VERSION } from "../../constants.js";
import type {
  GooglePubSubChannelBindingState,
  GooglePubSubMessageBindingState,
} from "../../decorators/bindings/googlepubsub/config.js";
import {
  GooglePubSubChannelBindingObject,
  GooglePubSubMessageBindingObject,
} from "../../types/index.js";

/** The emitted Pub/Sub object of either level. */
type GooglePubSubBindingObject =
  GooglePubSubChannelBindingObject | GooglePubSubMessageBindingObject;

type GooglePubSubBindingState = GooglePubSubChannelBindingState | GooglePubSubMessageBindingState;

/**
 * Renders the `googlepubsub` member of one Bindings Object.
 *
 * @param config - The configuration a Pub/Sub decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
export function renderGooglePubSubBinding(config: unknown): GooglePubSubBindingObject {
  return {
    ...(config as GooglePubSubBindingState),
    bindingVersion: GOOGLE_PUB_SUB_BINDING_VERSION,
  };
}
