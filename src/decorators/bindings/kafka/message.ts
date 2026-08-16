import { DecoratorContext, Model } from "@typespec/compiler";
import { KAFKA_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { KafkaMessageBindingState, schemaField, schemaIdLocation } from "./config.js";

/**
 * The `config` argument of `@kafkaMessage`, as the author wrote it.
 * @public
 */
export interface KafkaMessageBindingConfig {
  /** The schema of the message key, as a Schema Object. */
  key?: unknown;
  /** Where the schema id sits: `header` or `payload`. */
  schemaIdLocation?: string;
  /** How the schema id is encoded inside the payload, such as `apicurio-new`. */
  schemaIdPayloadEncoding?: string;
  /** How a consumer looks the schema up, such as `TopicIdStrategy`. */
  schemaLookupStrategy?: string;
}

/**
 * Adds the Kafka message binding to one message.
 *
 * The emitted object lands in `components.messages.<key>.bindings.kafka`, and
 * it always carries the `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`. A model without one is
 * reported once the document is built.
 *
 * `key` is a Schema Object. Write it as an object literal, and the emitter
 * writes it into the document as written. A value that is not an object is
 * reported and dropped.
 *
 * `schemaIdLocation` is `header` or `payload`. Any other value is reported
 * and dropped.
 *
 * Three fields describe a schema registry: `schemaIdLocation`,
 * `schemaIdPayloadEncoding` and `schemaLookupStrategy`. The Kafka binding
 * says none of them applies without a server-level `schemaRegistryUrl`. This
 * emitter does not check that, because the rule spans two objects.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param config - The Kafka message binding fields
 *
 * @example
 * ```typespec
 * @kafkaMessage(#{ key: #{ type: "string" }, schemaIdLocation: "payload" })
 * @message
 * model OrderCreated {
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $kafkaMessage(
  context: DecoratorContext,
  target: Model,
  config: KafkaMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: KafkaMessageBindingState = {
    ...present("key", schemaField(context, "key", config.key, configTarget)),
    ...present(
      "schemaIdLocation",
      schemaIdLocation(context, config.schemaIdLocation, configTarget),
    ),
    ...present("schemaIdPayloadEncoding", trimmed(config.schemaIdPayloadEncoding)),
    ...present("schemaLookupStrategy", trimmed(config.schemaLookupStrategy)),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: KAFKA_BINDING_PROTOCOL,
    renderer: "kafka",
    config: state,
    node: configTarget,
  });
}
