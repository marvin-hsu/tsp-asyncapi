import { DecoratorContext, Operation } from "@typespec/compiler";
import { KAFKA_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { KafkaOperationBindingState, schemaField } from "./config.js";

/**
 * The `config` argument of `@kafkaOperation`, as the author wrote it.
 * @public
 */
export interface KafkaOperationBindingConfig {
  /** The schema of the consumer group id, as a Schema Object. */
  groupId?: unknown;
  /** The schema of the consumer client id, as a Schema Object. */
  clientId?: unknown;
}

/**
 * Adds the Kafka operation binding to one operation.
 *
 * The emitted object lands in `operations.<id>.bindings.kafka`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to an operation that also carries `@send` or `@receive`. An
 * operation without an action is reported once the document is built.
 *
 * Both fields are Schema Objects. Write each one as an object literal, and
 * the emitter writes it into the document as written. A value that is not an
 * object is reported and dropped.
 *
 * @param context - The decorator context
 * @param target - The operation
 * @param config - The Kafka operation binding fields
 *
 * @example
 * ```typespec
 * @kafkaOperation(#{ groupId: #{ type: "string", const: "order-workers" } })
 * @receive
 * op onOrderCreated(): OrderCreated;
 * ```
 *
 * @public
 */
export function $kafkaOperation(
  context: DecoratorContext,
  target: Operation,
  config: KafkaOperationBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: KafkaOperationBindingState = {
    ...present("groupId", schemaField(context, "groupId", config.groupId, configTarget)),
    ...present("clientId", schemaField(context, "clientId", config.clientId, configTarget)),
  };

  claimBinding(context, {
    level: "operation",
    target,
    protocol: KAFKA_BINDING_PROTOCOL,
    renderer: "kafka",
    config: state,
    node: configTarget,
  });
}
