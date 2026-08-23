import { DecoratorContext, Operation } from "@typespec/compiler";
import { SQS_BINDING_PROTOCOL } from "../../../constants.js";
import { toPlainValue } from "../../../marshalled-values.js";
import { claimBinding } from "../state.js";
import { reportBindingField, reportMissingField } from "../fields.js";
import { OPERATION_QUEUE_REQUIRED, SqsOperationBindingState, readQueue } from "./config.js";

/**
 * The `config` argument of `@sqsOperation`, as the author wrote it.
 * @public
 */
export interface SqsOperationBindingConfig {
  /** The queues the operation reads from or writes to. It is required. */
  queues?: unknown;
}

/**
 * Adds the Amazon SQS operation binding to one operation.
 *
 * The emitted object lands in `operations.<key>.bindings.sqs`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to an operation that carries `@send` or `@receive`.
 *
 * `queues` is required, and every entry requires a `name`. An entry without
 * one is reported and dropped. A list left with no entry is reported as a
 * missing `queues`, because an empty list names no queue and AsyncAPI would
 * reject the emitted document.
 *
 * A queue here requires only a name. The channel binding requires a
 * `fifoQueue` as well, which is the difference AsyncAPI states between the
 * two levels.
 *
 * @param context - The decorator context
 * @param target - The operation
 * @param config - The Amazon SQS operation binding fields
 *
 * @example
 * ```typespec
 * @sqsOperation(#{ queues: #[#{ name: "orders", fifoQueue: false }] })
 * @receive
 * op onOrder(): OrderCreated;
 * ```
 *
 * @public
 */
export function $sqsOperation(
  context: DecoratorContext,
  target: Operation,
  config: SqsOperationBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;

  if (config.queues === undefined) {
    reportMissingField(context, SQS_BINDING_PROTOCOL, "queues", configTarget);
    return;
  }
  const written = toPlainValue(context.program, config.queues);
  if (!Array.isArray(written)) {
    reportBindingField(context, SQS_BINDING_PROTOCOL, "queues", "a list of queues", configTarget);
    return;
  }

  const queues = written
    .map((entry, index) =>
      readQueue(context, `queues[${String(index)}]`, entry, OPERATION_QUEUE_REQUIRED, configTarget),
    )
    .filter((queue) => queue !== undefined);

  // Every entry was rejected, or the author wrote an empty list. Either way
  // the emitted binding would carry no queue, which AsyncAPI refuses.
  if (queues.length === 0) {
    reportMissingField(context, SQS_BINDING_PROTOCOL, "queues", configTarget);
    return;
  }

  const state: SqsOperationBindingState = { queues };

  claimBinding(context, {
    level: "operation",
    target,
    protocol: SQS_BINDING_PROTOCOL,
    renderer: "sqs",
    config: state,
    node: configTarget,
  });
}
