/**
 * The Kafka renderer.
 *
 * It turns a recorded configuration into the object AsyncAPI puts under
 * `bindings.kafka`. One function covers all four levels. The four Kafka
 * decorators already record their fields under the names the document uses,
 * and each one drops a field that carried nothing or failed a check. So the
 * recorded state is the emitted object, and the renderer adds one thing to
 * it.
 *
 * That one thing is `bindingVersion`. Every Kafka decorator knows which
 * version of the Kafka binding its fields come from, so the version is
 * written here rather than by each decorator. The generic `@binding` writes
 * no version, for the opposite reason: it never reads the shape of what it
 * was given.
 *
 * Nothing here re-checks a value. The presence of a field is decided once,
 * by the decorator that recorded it.
 */

import { KAFKA_BINDING_VERSION } from "../../constants.js";
import {
  KafkaChannelBindingState,
  KafkaMessageBindingState,
  KafkaOperationBindingState,
  KafkaServerBindingState,
} from "../../decorators/bindings/kafka/config.js";
import {
  KafkaChannelBindingObject,
  KafkaMessageBindingObject,
  KafkaOperationBindingObject,
  KafkaServerBindingObject,
} from "../../types.js";

/**
 * The emitted Kafka object of any one level.
 *
 * The four levels carry different fields, and the renderer never chooses
 * between them. It is the recording decorator that fixes which level a
 * configuration belongs to.
 */
type KafkaBindingObject =
  | KafkaServerBindingObject
  | KafkaChannelBindingObject
  | KafkaOperationBindingObject
  | KafkaMessageBindingObject;

/**
 * Renders the `kafka` member of one Bindings Object.
 *
 * @param config - The configuration a Kafka decorator recorded
 * @returns The emitted object, with the binding version appended
 * @internal
 */
type KafkaBindingState =
  | KafkaServerBindingState
  | KafkaChannelBindingState
  | KafkaOperationBindingState
  | KafkaMessageBindingState;

export function renderKafkaBinding(config: unknown): KafkaBindingObject {
  // The parameter is `unknown` because the caller holds a map of renderers
  // that all share one signature. The narrowing happens here, and it is what
  // makes the return type mean anything: spreading a value typed `object`
  // contributes no properties, so the declared type would only ever be
  // checked for `bindingVersion`.
  return { ...(config as KafkaBindingState), bindingVersion: KAFKA_BINDING_VERSION };
}
