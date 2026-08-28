import { DecoratorContext, Operation } from "@typespec/compiler";
import { SQS_BINDING_PROTOCOL } from "../../../constants.js";
import { claimBinding } from "../state.js";
import { listField, reportMissingField } from "../fields.js";
import type { SqsQueueObject } from "../../../types/index.js";
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
 * one is reported, and the whole binding goes with it. An empty list is
 * reported as a missing `queues`, because an empty list names no queue and
 * AsyncAPI would reject the emitted document.
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
  const written = listField(
    context,
    SQS_BINDING_PROTOCOL,
    "queues",
    config.queues,
    "a list of queues",
    configTarget,
    "binding",
  );
  if (written === undefined) return;

  const queues: SqsQueueObject[] = [];
  for (const [index, entry] of written.entries()) {
    // The loss is `binding`: a non-object entry reports an error, not a
    // single-field warning.
    const queue = readQueue(
      context,
      `queues[${String(index)}]`,
      entry,
      OPERATION_QUEUE_REQUIRED,
      configTarget,
      "binding",
    );
    // A refused entry drops the whole binding, not just that entry. Skipping
    // it would emit fewer queues than the author declared, which is worse
    // than no binding.
    //
    // Later entries are never read. Reading one would report its fields as
    // kept for a binding that is never emitted.
    if (queue.outcome !== "read") return;
    queues.push(queue.value);
  }

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
