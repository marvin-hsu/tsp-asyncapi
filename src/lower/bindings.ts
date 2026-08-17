/**
 * The lower half of the bindings.
 *
 * It turns resolved nodes into the Bindings Object AsyncAPI puts on a server,
 * a channel, an operation, and a message. All four hold the same shape: one
 * member per protocol.
 *
 * This half reads no decorator state and reports no diagnostic. Which
 * applications reach one object, and which of two claims on one protocol
 * wins, were both settled in resolve.
 *
 * Rendering a binding is one step: write the version of the specification
 * its fields follow. Every decorator records its fields under the names the
 * document uses, and drops a field that carried nothing or failed a check.
 * So what a decorator stored is what the document carries, apart from
 * `bindingVersion`.
 *
 * That is why this file holds a table of versions rather than a table of
 * functions. Twelve protocols each had a renderer that spread the recorded
 * config and appended one constant. Twelve copies of one decision meant
 * twelve places to look when the decision changed.
 */

// A type, never a state read. The lower half names the protocol the state
// layer recorded, so a name added to the union without an entry below is a
// compile error. `import type` keeps it a type: this half cannot call into
// the state layer even by accident.
import type { BindingRenderer } from "../decorators/bindings/state.js";
import type { BindingNode } from "../resolve/service.js";
import {
  AMQP_BINDING_VERSION,
  ANYPOINT_MQ_BINDING_VERSION,
  GOOGLE_PUB_SUB_BINDING_VERSION,
  HTTP_BINDING_VERSION,
  IBM_MQ_BINDING_VERSION,
  JMS_BINDING_VERSION,
  KAFKA_BINDING_VERSION,
  MQTT_BINDING_VERSION,
  NATS_BINDING_VERSION,
  PULSAR_BINDING_VERSION,
  SOLACE_BINDING_VERSION,
  SQS_BINDING_VERSION,
  WEBSOCKET_BINDING_VERSION,
} from "../constants.js";
import { BindingObject, BindingsObject } from "../types/index.js";

/**
 * The specification version each protocol's fields follow.
 *
 * The decorators record a protocol name rather than a version, so the state
 * layer never imports this table. That keeps raising a version to one edit
 * here, whatever number of levels the protocol covers. One entry serves all
 * four Kafka levels, because each Kafka decorator already records its fields
 * under the names the document uses.
 *
 * `verbatim` is `null` rather than a version. The generic `@binding` holds
 * plain JSON and is emitted as written, because it never reads the shape of
 * what it was given. A version it did not ask for would be a claim about
 * fields this emitter never checked.
 *
 * The key type is the `BindingRenderer` union itself. So a protocol added to
 * the union and forgotten here fails the build, rather than reaching `render`
 * as an undefined value and emitting a binding with no version.
 */
const BINDING_VERSIONS: Record<BindingRenderer, string | null> = {
  verbatim: null,
  kafka: KAFKA_BINDING_VERSION,
  // The member is `ws`, which the decorator records as the protocol name.
  websocket: WEBSOCKET_BINDING_VERSION,
  mqtt: MQTT_BINDING_VERSION,
  http: HTTP_BINDING_VERSION,
  amqp: AMQP_BINDING_VERSION,
  nats: NATS_BINDING_VERSION,
  pulsar: PULSAR_BINDING_VERSION,
  googlepubsub: GOOGLE_PUB_SUB_BINDING_VERSION,
  sqs: SQS_BINDING_VERSION,
  anypointmq: ANYPOINT_MQ_BINDING_VERSION,
  jms: JMS_BINDING_VERSION,
  ibmmq: IBM_MQ_BINDING_VERSION,
  solace: SOLACE_BINDING_VERSION,
};

/**
 * Renders one binding.
 *
 * The version is appended rather than prepended, so it is the last key of the
 * emitted member. That is the order the specification lists it in, and the
 * order every example in the AsyncAPI binding repository shows.
 */
function render(node: BindingNode): BindingObject {
  const config = node.config as BindingObject;
  const version = BINDING_VERSIONS[node.renderer];
  if (version === null) return config;
  return { ...config, bindingVersion: version };
}

/**
 * Builds the Bindings Object from resolved nodes.
 *
 * @param nodes - The resolved bindings of one object, in source order
 * @returns The `bindings` object, or `undefined` when there is no node. The
 * caller then omits the field, because an empty Bindings Object states
 * nothing.
 * @internal
 */
export function lowerBindings(nodes: readonly BindingNode[]): BindingsObject | undefined {
  if (nodes.length === 0) return undefined;
  // The object is built from entries. A protocol name is written by the
  // author, so a name such as `__proto__` becomes an own key instead of a
  // write to the prototype.
  return Object.fromEntries(nodes.map((node) => [node.protocol, render(node)]));
}
