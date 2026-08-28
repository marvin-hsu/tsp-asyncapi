import { DecoratorContext, Namespace } from "@typespec/compiler";
import { KAFKA_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { KafkaServerBindingState } from "./config.js";

/**
 * The `config` argument of `@kafkaServer`, as the author wrote it.
 * @public
 */
export interface KafkaServerBindingConfig {
  /** The URL of the schema registry the servers use. */
  schemaRegistryUrl?: string;
  /** The vendor of that registry, such as `confluent` or `apicurio`. */
  schemaRegistryVendor?: string;
}

/**
 * Adds the Kafka server binding to the servers of one namespace.
 *
 * The emitted object lands in `servers.<name>.bindings.kafka`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the service namespace. Every server that namespace declares
 * gets its own copy of the binding. `@server` is repeatable and keyed by
 * name, so no decorator target can single one server out. This follows the
 * rule the namespace-level `security` and `externalDocs` already use. Two
 * servers of one namespace therefore cannot name two different schema
 * registries.
 *
 * A namespace that declares no emitted server is reported once the document
 * is built.
 *
 * @example
 * ```typespec
 * @kafkaServer(#{
 *   schemaRegistryUrl: "https://registry.example.com",
 *   schemaRegistryVendor: "confluent",
 * })
 * @server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $kafkaServer(
  context: DecoratorContext,
  target: Namespace,
  config: KafkaServerBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: KafkaServerBindingState = {
    ...present("schemaRegistryUrl", trimmed(config.schemaRegistryUrl)),
    ...present("schemaRegistryVendor", trimmed(config.schemaRegistryVendor)),
  };

  claimBinding(context, {
    level: "server",
    target,
    protocol: KAFKA_BINDING_PROTOCOL,
    renderer: "kafka",
    config: state,
    node: configTarget,
  });
}
