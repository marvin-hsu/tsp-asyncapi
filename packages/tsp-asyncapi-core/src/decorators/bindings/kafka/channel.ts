/** The Kafka channel binding: topic name, partition and replica counts, and topic configuration. */

import { DecoratorContext, Interface, Namespace } from "@typespec/compiler";
import { KAFKA_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { KafkaChannelBindingState, positiveCount, topicConfiguration } from "./config.js";

/**
 * The `config` argument of `@kafkaChannel`, as the author wrote it.
 * @public
 */
export interface KafkaChannelBindingConfig {
  /** The topic name, when it differs from the channel address. */
  topic?: string;
  /** The number of partitions of the topic. */
  partitions?: number;
  /** The number of replicas of the topic. */
  replicas?: number;
  /** The Kafka topic configuration, such as `cleanup.policy`. */
  topicConfiguration?: Record<string, unknown>;
}

/**
 * Adds the Kafka channel binding to one channel.
 *
 * The emitted object lands in `channels.<id>.bindings.kafka`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`. A target with no emitted channel is reported once the
 * document is built.
 *
 * `partitions` and `replicas` are positive integers. A value outside that
 * range is reported and dropped, and the rest of the binding is kept.
 *
 * `topicConfiguration` passes through as written. Kafka names its topic
 * settings with dots, and a broker accepts vendor settings beside them, so
 * this map stays open. The one value that is checked is `cleanup.policy`,
 * whose entries are `delete` and `compact`.
 *
 * @example
 * ```typespec
 * @kafkaChannel(#{
 *   topic: "orders.created",
 *   partitions: 12,
 *   replicas: 3,
 *   topicConfiguration: #{ `cleanup.policy`: #["compact"] },
 * })
 * @channel("orders.created")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $kafkaChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: KafkaChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: KafkaChannelBindingState = {
    ...present("topic", trimmed(config.topic)),
    ...present("partitions", positiveCount(context, "partitions", config.partitions, configTarget)),
    ...present("replicas", positiveCount(context, "replicas", config.replicas, configTarget)),
    ...present(
      "topicConfiguration",
      topicConfiguration(context, config.topicConfiguration, configTarget),
    ),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: KAFKA_BINDING_PROTOCOL,
    renderer: "kafka",
    config: state,
    node: configTarget,
  });
}
