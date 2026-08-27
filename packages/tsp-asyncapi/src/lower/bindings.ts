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
 * ## A reference goes on the whole object, never on one protocol
 *
 * `serverBindingsObject.json` gives `properties.jms` a `properties` and an
 * `allOf` and no `oneOf Reference`. So `$ref` is legal at `server.bindings`
 * and rejected at `server.bindings.jms`. That is why the unit this emitter
 * shares through `components` is the whole Bindings Object — see
 * `lower/components/survey.ts`.
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
import type { BindingNode } from "tsp-asyncapi-core/unstable";
import {
  type BindingRenderer,
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
} from "tsp-asyncapi-core";
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
  // The config is copied rather than handed over. It belongs to the resolved
  // model, which every stage after resolve treats as read only. The copy is
  // also what gives the document types the mutable value they declare.
  const version = BINDING_VERSIONS[node.renderer];
  if (version === null) return { ...node.config };
  return { ...node.config, bindingVersion: version };
}

/**
 * The Bindings Object of each site, rendered once per document.
 *
 * Two stages need it. The survey renders every site to decide which objects
 * are shared, and each site renders again to write what it carries. The
 * second render answered a question the first one had already answered.
 *
 * The key is the node list itself, which the resolved model holds one of per
 * site. So one site is one entry, and the table lives exactly as long as the
 * build that made it.
 *
 * @internal
 */
export class BindingsRenderer {
  readonly #rendered = new Map<readonly BindingNode[], BindingsObject | undefined>();

  /**
   * The Bindings Object of one site.
   *
   * @param nodes - The resolved bindings of that site, in source order
   * @returns What {@link lowerBindings} writes for them, rendered once
   */
  public render(nodes: readonly BindingNode[]): BindingsObject | undefined {
    // `has` rather than a truthy check: a site with no node renders to
    // `undefined`, and that answer is worth keeping too.
    if (this.#rendered.has(nodes)) return this.#rendered.get(nodes);
    const rendered = lowerBindings(nodes);
    this.#rendered.set(nodes, rendered);
    return rendered;
  }
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
