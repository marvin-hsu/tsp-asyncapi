import { DecoratorContext, Interface, Namespace } from "@typespec/compiler";
import { GOOGLE_PUB_SUB_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { reportMissingField } from "../fields.js";
import {
  GooglePubSubChannelBindingState,
  messageStoragePolicy,
  openMap,
  schemaSettings,
} from "./config.js";

/**
 * The `config` argument of `@googlePubSubChannel`, as the author wrote it.
 * @public
 */
export interface GooglePubSubChannelBindingConfig {
  /** The schema the topic validates against. It is required. */
  schemaSettings?: unknown;
  /** The labels of the topic. */
  labels?: unknown;
  /** How long a message is kept, such as `86400s`. */
  messageRetentionDuration?: string;
  /** Where the messages are stored. */
  messageStoragePolicy?: unknown;
}

/**
 * Adds the Google Cloud Pub/Sub channel binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.googlepubsub`, and it
 * always carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`.
 *
 * `schemaSettings` is required, and it requires an `encoding` and a `name` of
 * its own. A binding without them is reported and dropped whole, because
 * AsyncAPI would reject the emitted document.
 *
 * `labels` is an open map. Pub/Sub puts no rule on its keys or values, so it
 * is emitted as written.
 *
 * @param context - The decorator context
 * @param target - The channel interface or namespace
 * @param config - The Google Cloud Pub/Sub channel binding fields
 *
 * @example
 * ```typespec
 * @googlePubSubChannel(#{
 *   schemaSettings: #{ encoding: "json", name: "projects/p/schemas/order" },
 *   messageRetentionDuration: "86400s"
 * })
 * @channel("orders-created")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $googlePubSubChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: GooglePubSubChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;

  if (config.schemaSettings === undefined) {
    reportMissingField(context, GOOGLE_PUB_SUB_BINDING_PROTOCOL, "schemaSettings", configTarget);
    return;
  }
  const settings = schemaSettings(context, config.schemaSettings, configTarget);
  // `schemaSettings` reported whatever was wrong with it. The binding cannot
  // be written without the field, so it goes whole.
  if (settings.outcome !== "read") return;

  const state: GooglePubSubChannelBindingState = {
    schemaSettings: settings.value,
    ...present("labels", openMap(context, "labels", config.labels, configTarget)),
    ...present("messageRetentionDuration", trimmed(config.messageRetentionDuration)),
    ...present(
      "messageStoragePolicy",
      messageStoragePolicy(context, config.messageStoragePolicy, configTarget),
    ),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: GOOGLE_PUB_SUB_BINDING_PROTOCOL,
    renderer: "googlepubsub",
    config: state,
    node: configTarget,
  });
}
