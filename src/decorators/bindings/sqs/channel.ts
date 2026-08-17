import { DecoratorContext, Interface, Namespace } from "@typespec/compiler";
import { SQS_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import { claimBinding } from "../state.js";
import { reportMissingField } from "../fields.js";
import { CHANNEL_QUEUE_REQUIRED, SqsChannelBindingState, readQueue } from "./config.js";

/**
 * The `config` argument of `@sqsChannel`, as the author wrote it.
 * @public
 */
export interface SqsChannelBindingConfig {
  /** The queue the channel is. It is required. */
  queue?: unknown;
  /** The queue that receives a message which cannot be processed. */
  deadLetterQueue?: unknown;
}

/**
 * Adds the Amazon SQS channel binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.sqs`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`.
 *
 * `queue` is required, and it requires a `name` and a `fifoQueue` of its own.
 * A binding without them is reported and dropped whole, because AsyncAPI
 * would reject the emitted document.
 *
 * `deadLetterQueue` is optional and has the same shape. A dead letter queue
 * that is written but incomplete is reported and dropped, and the rest of the
 * binding is kept.
 *
 * @param context - The decorator context
 * @param target - The channel interface or namespace
 * @param config - The Amazon SQS channel binding fields
 *
 * @example
 * ```typespec
 * @sqsChannel(#{
 *   queue: #{ name: "orders", fifoQueue: false, visibilityTimeout: 30 },
 *   deadLetterQueue: #{ name: "orders-dlq", fifoQueue: false }
 * })
 * @channel("orders")
 * interface OrderChannel {}
 * ```
 *
 * @public
 */
export function $sqsChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: SqsChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;

  if (config.queue === undefined) {
    reportMissingField(context, SQS_BINDING_PROTOCOL, "queue", configTarget);
    return;
  }
  const queue = readQueue(context, "queue", config.queue, CHANNEL_QUEUE_REQUIRED, configTarget);
  // `readQueue` reported whatever was wrong. The binding cannot be written
  // without the queue, so it goes whole.
  if (queue === undefined) return;

  const state: SqsChannelBindingState = {
    queue,
    ...present(
      "deadLetterQueue",
      config.deadLetterQueue === undefined
        ? undefined
        : readQueue(
            context,
            "deadLetterQueue",
            config.deadLetterQueue,
            CHANNEL_QUEUE_REQUIRED,
            configTarget,
          ),
    ),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: SQS_BINDING_PROTOCOL,
    renderer: "sqs",
    config: state,
    node: configTarget,
  });
}
