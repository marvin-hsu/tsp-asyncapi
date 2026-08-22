import type { BindingRenderer } from "../../src/decorators/bindings/state.js";

/**
 * Every binding renderer, taken from a record keyed by the union.
 *
 * The record is the enforcement. A renderer added to the union without a line
 * here fails the build, so neither an enumeration nor a sampler can silently
 * miss one.
 */
const RENDERER_TABLE: Record<BindingRenderer, null> = {
  verbatim: null,
  kafka: null,
  websocket: null,
  mqtt: null,
  http: null,
  amqp: null,
  nats: null,
  pulsar: null,
  googlepubsub: null,
  sqs: null,
  anypointmq: null,
  jms: null,
  ibmmq: null,
  solace: null,
};

/** The renderer names, in the order the table lists them. */
export const RENDERERS = Object.keys(RENDERER_TABLE) as readonly BindingRenderer[];
