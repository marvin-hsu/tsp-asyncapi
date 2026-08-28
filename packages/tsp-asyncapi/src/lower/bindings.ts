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
 * Rendering a binding writes the version its fields follow, then keeps every
 * field the decorator recorded. `serverBindingsObject.json` allows `$ref`
 * only on the whole Bindings Object, never on one protocol member. So this
 * emitter shares the whole object through `components` rather than one
 * protocol at a time; see `lower/components/survey.ts` for how it picks
 * which ones to share.
 *
 * This file holds a table of versions rather than a table of per-protocol
 * render functions, to avoid repeating the same append-one-constant logic
 * twelve times.
 */

// A type-only import, so this half cannot read the state layer even by
// accident.
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
 * The decorators record a protocol name rather than a version, so raising a
 * version is one edit here, whatever number of levels the protocol covers.
 * One entry serves all four Kafka levels, because each Kafka decorator
 * already records its fields under the names the document uses.
 *
 * `verbatim` maps to `null`. The generic `@binding` holds plain JSON and is
 * emitted as written, since it never reads the shape of what it was given,
 * so no version applies to it.
 *
 * The key type is `BindingRenderer`, so a protocol added to that union and
 * forgotten here fails the build instead of reaching `render` as an
 * undefined value.
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
 * The version goes last, matching the field order every AsyncAPI binding
 * example uses.
 *
 * @param node - The resolved node being lowered
 */
function render(node: BindingNode): BindingObject {
  // Copied, not handed over: the resolved model stays read only, and the
  // document types need a mutable object anyway.
  const version = BINDING_VERSIONS[node.renderer];
  if (version === null) return { ...node.config };
  return { ...node.config, bindingVersion: version };
}

/**
 * The Bindings Object of each site, rendered once per document.
 *
 * The survey renders every site to decide what to share, then each site
 * renders again to write what it carries. Caching here means the second
 * render only answers a question the first one already asked. The map keys
 * on the node list itself, since the resolved model holds one per site, and
 * it lives only as long as this build.
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
    // `has`, not a truthy check: a site with no bindings still caches its
    // `undefined` answer.
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
  // Built from entries, so a protocol named `__proto__` becomes an own key
  // instead of a write to the prototype.
  return Object.fromEntries(nodes.map((node) => [node.protocol, render(node)]));
}
