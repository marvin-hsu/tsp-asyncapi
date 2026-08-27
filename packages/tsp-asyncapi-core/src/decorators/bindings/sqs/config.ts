/**
 * The recorded shape of both Amazon SQS bindings, and the queue reader they
 * share.
 *
 * A queue appears in three places: the `queue` and `deadLetterQueue` of a
 * channel, and every entry of the `queues` list of an operation. One reader
 * covers all three, so the field rules of a queue are decided once.
 *
 * The two levels require different fields of a queue. A channel binding needs
 * a name and a FIFO flag. An operation binding needs only a name. The reader
 * takes the required set as an argument rather than guessing from the shape.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { SQS_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import { isPlainObject, toPlainValue } from "../../../marshalled-values.js";
import type {
  SqsChannelBindingObject,
  SqsOperationBindingObject,
  SqsQueueObject,
} from "../../../types/index.js";
import {
  enumeratedField,
  NestedRead,
  nonNegativeField,
  objectField,
  requiredFields,
} from "../fields.js";

/**
 * What each Amazon SQS decorator records.
 *
 * Each one is the emitted object without `bindingVersion`. That field is
 * appended when the document is built.
 * @internal
 */
export type SqsChannelBindingState = Omit<SqsChannelBindingObject, "bindingVersion">;

/** @internal */
export type SqsOperationBindingState = Omit<SqsOperationBindingObject, "bindingVersion">;

/** What deduplication applies to. */
const DEDUPLICATION_SCOPES = ["queue", "messageGroup"];

/** How SQS counts throughput on a FIFO queue. */
const THROUGHPUT_LIMITS = ["perQueue", "perMessageGroupId"];

/** The fields a channel binding requires of a queue. */
export const CHANNEL_QUEUE_REQUIRED = ["name", "fifoQueue"];

/** The fields an operation binding requires of a queue. */
export const OPERATION_QUEUE_REQUIRED = ["name"];

/**
 * Reads one queue.
 *
 * Every field rule SQS states about a queue is applied here. A field that
 * fails a rule is reported and dropped on its own, and the rest of the queue
 * survives. A required field that is absent is different. The queue cannot be
 * emitted at all, and the diagnostic for it is an error. So the reader names
 * that outcome apart from the others, and the caller drops the whole binding
 * on it.
 *
 * `redrivePolicy`, `policy` and `tags` pass through as written. SQS states no
 * shape this emitter can check for them.
 *
 * @param context - The decorator context
 * @param field - The path of this queue, for the diagnostics
 * @param value - The queue as the author wrote it, still marshalled
 * @param required - The fields this level requires
 * @param target - Where a problem is reported
 * @returns The queue, `dropped` when it was not an object, or `incomplete`
 * when a required field is absent
 * @internal
 */
export function readQueue(
  context: DecoratorContext,
  field: string,
  value: unknown,
  required: readonly string[],
  target: DiagnosticTarget,
): NestedRead<SqsQueueObject> {
  const plain = objectField(context, SQS_BINDING_PROTOCOL, field, value, target);
  if (plain === undefined) return { outcome: "dropped" };

  if (!requiredFields(context, SQS_BINDING_PROTOCOL, field, plain, required, target)) {
    return { outcome: "incomplete" };
  }

  const queue: SqsQueueObject = {
    name: (plain.name as string).trim(),
    ...present("fifoQueue", plain.fifoQueue as boolean | undefined),
    ...present(
      "deduplicationScope",
      enumeratedField(
        context,
        SQS_BINDING_PROTOCOL,
        `${field}.deduplicationScope`,
        plain.deduplicationScope as string | undefined,
        DEDUPLICATION_SCOPES,
        target,
      ),
    ),
    ...present(
      "fifoThroughputLimit",
      enumeratedField(
        context,
        SQS_BINDING_PROTOCOL,
        `${field}.fifoThroughputLimit`,
        plain.fifoThroughputLimit as string | undefined,
        THROUGHPUT_LIMITS,
        target,
      ),
    ),
    ...present("deliveryDelay", seconds(context, field, "deliveryDelay", plain, target)),
    ...present("visibilityTimeout", seconds(context, field, "visibilityTimeout", plain, target)),
    ...present(
      "receiveMessageWaitTime",
      seconds(context, field, "receiveMessageWaitTime", plain, target),
    ),
    ...present(
      "messageRetentionPeriod",
      seconds(context, field, "messageRetentionPeriod", plain, target),
    ),
    ...present("redrivePolicy", objectOrUndefined(context, plain.redrivePolicy)),
    ...present("policy", objectOrUndefined(context, plain.policy)),
    ...present("tags", objectOrUndefined(context, plain.tags)),
  };
  return { outcome: "read", value: queue };
}

/**
 * Checks one of the four fields SQS states as a number of seconds.
 *
 * A length of time is never negative. Zero is a value on all four: it turns
 * the delay, the timeout or the wait off.
 */
function seconds(
  context: DecoratorContext,
  queueField: string,
  field: string,
  plain: Record<string, unknown>,
  target: DiagnosticTarget,
): number | undefined {
  return nonNegativeField(
    context,
    SQS_BINDING_PROTOCOL,
    `${queueField}.${field}`,
    plain[field] as number | undefined,
    "seconds",
    target,
  );
}

/** Passes an object through, and drops anything else without a report. */
function objectOrUndefined(
  context: DecoratorContext,
  value: unknown,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  return isPlainObject(plain) ? plain : undefined;
}
