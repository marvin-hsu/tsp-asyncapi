import { DecoratorContext, Model } from "@typespec/compiler";
import { GOOGLE_PUB_SUB_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { GooglePubSubMessageBindingState, messageSchema, openMap } from "./config.js";

/**
 * `@googlePubSubMessage`, which fills the message-level Google Cloud
 * Pub/Sub Bindings Object. The field checks live in `config.ts`, and the
 * slot is claimed here.
 */

/**
 * The `config` argument of `@googlePubSubMessage`, as the author wrote it.
 * @public
 */
export interface GooglePubSubMessageBindingConfig {
  /** The attributes carried alongside the payload. */
  attributes?: unknown;
  /** The key that orders messages within one region. */
  orderingKey?: string;
  /** The schema the message validates against. */
  schema?: unknown;
}

/**
 * Adds the Google Cloud Pub/Sub message binding to one message.
 *
 * The emitted object lands in
 * `components.messages.<key>.bindings.googlepubsub`, and it always carries
 * the `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`. A model without one is
 * reported once the document is built.
 *
 * No field of this binding is required. `schema` is optional, but a `schema`
 * written without a `name` names no schema. That is reported as an error, and
 * the whole binding goes with it.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param config - The Google Cloud Pub/Sub message binding fields
 *
 * @example
 * ```typespec
 * @googlePubSubMessage(#{
 *   orderingKey: "customer-id",
 *   schema: #{ name: "projects/p/schemas/order" }
 * })
 * @message
 * model OrderCreated {
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $googlePubSubMessage(
  context: DecoratorContext,
  target: Model,
  config: GooglePubSubMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;

  const schema = messageSchema(context, config.schema, configTarget);
  // The schema has no name. That is an error, and the error says the binding
  // was dropped, so the binding is dropped.
  if (schema.outcome === "incomplete") return;

  const state: GooglePubSubMessageBindingState = {
    ...present("attributes", openMap(context, "attributes", config.attributes, configTarget)),
    ...present("orderingKey", trimmed(config.orderingKey)),
    ...present("schema", schema.outcome === "read" ? schema.value : undefined),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: GOOGLE_PUB_SUB_BINDING_PROTOCOL,
    renderer: "googlepubsub",
    config: state,
    node: configTarget,
  });
}
