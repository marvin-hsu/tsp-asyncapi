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
 */

// A type, never a state read. The lower half names the renderer the state
// layer recorded, so a name added to the union without an entry below is a
// compile error. `import type` keeps it a type: this half cannot call into
// the state layer even by accident.
import type { BindingRenderer } from "../decorators/bindings/state.js";
import type { BindingNode } from "../resolve/service.js";
import { BindingObject, BindingsObject } from "../types/index.js";
import { renderKafkaBinding } from "./bindings/kafka.js";
import { renderAmqpBinding } from "./bindings/amqp.js";
import { renderAnypointMqBinding } from "./bindings/anypointmq.js";
import { renderIbmMqBinding } from "./bindings/ibmmq.js";
import { renderJmsBinding } from "./bindings/jms.js";
import { renderSolaceBinding } from "./bindings/solace.js";
import { renderGooglePubSubBinding } from "./bindings/googlepubsub.js";
import { renderNatsBinding } from "./bindings/nats.js";
import { renderPulsarBinding } from "./bindings/pulsar.js";
import { renderSqsBinding } from "./bindings/sqs.js";
import { renderHttpBinding } from "./bindings/http.js";
import { renderMqttBinding } from "./bindings/mqtt.js";
import { renderWebSocketBinding } from "./bindings/websocket.js";

/**
 * The renderer of each resolved binding, by name.
 *
 * The decorators record a renderer name rather than a function, so the state
 * layer never imports a builder. This map is the other half of that split.
 * A new protocol adds a file under this folder and an entry here. It changes
 * no builder.
 *
 * Each renderer returns the object of its own protocol. Those types are
 * interfaces, and an interface carries no index signature, so the value type
 * stays the wider `object` and `render` narrows the result once.
 *
 * The key type is the `BindingRenderer` union itself. So a name added to the
 * union and forgotten here fails the build, rather than reaching `render` as
 * an undefined function and throwing while a document is emitted.
 */
const RENDERERS: Record<BindingRenderer, (config: unknown) => object> = {
  // The generic `@binding` already holds plain JSON, and it is emitted as
  // written. Nothing is added to it, `bindingVersion` included.
  verbatim: (config) => config as BindingObject,
  // One name covers all four Kafka levels. Each decorator records its fields
  // under the names the document uses, so the rendering is the same at every
  // level.
  kafka: renderKafkaBinding,
  // The WebSocket binding covers one level, so its renderer covers one
  // level too. The member it lands under is `ws`, which the decorator
  // records as the protocol name.
  websocket: renderWebSocketBinding,
  // One name covers all three MQTT levels, for the same reason it covers
  // all four Kafka levels. There is no channel level: the MQTT binding
  // says a channel object must carry no property.
  mqtt: renderMqttBinding,
  // HTTP covers an operation and a message. AsyncAPI defines no HTTP
  // server or channel object with fields of its own.
  http: renderHttpBinding,
  // AMQP covers a channel, an operation and a message. Its server object
  // carries no property.
  amqp: renderAmqpBinding,
  // NATS defines one object, on an operation.
  nats: renderNatsBinding,
  // Pulsar covers a server and a channel.
  pulsar: renderPulsarBinding,
  // Google Cloud Pub/Sub covers a channel and a message.
  googlepubsub: renderGooglePubSubBinding,
  // Amazon SQS covers a channel and an operation.
  sqs: renderSqsBinding,
  // Anypoint MQ covers a channel and a message.
  anypointmq: renderAnypointMqBinding,
  // JMS covers a server, a channel and a message.
  jms: renderJmsBinding,
  // IBM MQ covers a server, a channel and a message.
  ibmmq: renderIbmMqBinding,
  // Solace covers a server and an operation.
  solace: renderSolaceBinding,
};

/** Runs the renderer one node names. */
function render(node: BindingNode): BindingObject {
  return RENDERERS[node.renderer](node.config) as BindingObject;
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
