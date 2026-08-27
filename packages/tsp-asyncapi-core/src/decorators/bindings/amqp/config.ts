/**
 * The recorded shape of every AMQP binding, and the field checks the three
 * decorators share.
 *
 * The member is `amqp`, which covers AMQP 0-9-1. AsyncAPI defines a separate
 * `amqp1` binding for AMQP 1.0, and this library does not emit it.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { AMQP_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import type {
  AmqpChannelBindingObject,
  AmqpExchangeObject,
  AmqpMessageBindingObject,
  AmqpOperationBindingObject,
  AmqpQueueObject,
} from "../../../types/index.js";
import {
  boundedName,
  enumeratedField,
  nonEmptyObject,
  nonNegativeField,
  numericField,
  objectField,
  stringListField,
} from "../fields.js";

/**
 * What one AMQP decorator records, for each of the three levels.
 *
 * Each one is the emitted object without `bindingVersion`. That field is
 * appended when the document is built.
 *
 * There is no server level. The AMQP binding defines a server object that its
 * own text says must carry no property.
 *
 * @internal
 */
export type AmqpChannelBindingState = Omit<AmqpChannelBindingObject, "bindingVersion">;

/** @internal */
export type AmqpOperationBindingState = Omit<AmqpOperationBindingObject, "bindingVersion">;

/** @internal */
export type AmqpMessageBindingState = Omit<AmqpMessageBindingObject, "bindingVersion">;

/** What a channel may be bound to. */
const CHANNEL_KINDS = ["queue", "routingKey"];

/** The five exchange types AMQP 0-9-1 defines. */
const EXCHANGE_TYPES = ["topic", "direct", "fanout", "default", "headers"];

/** The two delivery modes: transient and persistent. */
const DELIVERY_MODES = [1, 2];

/**
 * The longest name AMQP allows for an exchange or a queue.
 *
 * The binding states the limit, and a broker rejects a longer name at connect
 * time. Emitting one would write a document that describes a topology the
 * broker refuses to build.
 */
const MAX_NAME_LENGTH = 255;

/**
 * Checks the `is` field of the channel binding.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function channelKind(
  context: DecoratorContext,
  value: string | undefined,
  target: DiagnosticTarget,
): string | undefined {
  return enumeratedField(context, AMQP_BINDING_PROTOCOL, "is", value, CHANNEL_KINDS, target);
}

/**
 * Checks the `deliveryMode` field of the operation binding.
 *
 * AMQP states `1` for transient and `2` for persistent. There is no third
 * mode.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function deliveryMode(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  return numericField(
    context,
    AMQP_BINDING_PROTOCOL,
    "deliveryMode",
    value,
    DELIVERY_MODES,
    target,
  );
}

/**
 * Checks the `expiration` field of the operation binding.
 *
 * AMQP states the value as a number of milliseconds, and a length of time is
 * never negative.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function expiration(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  return nonNegativeField(context, AMQP_BINDING_PROTOCOL, "expiration", value, undefined, target);
}

/**
 * Checks one routing key list of the operation binding.
 *
 * `cc` and `bcc` each hold routing keys. A blank entry names no key, so it is
 * dropped. A list left with nothing in it is dropped as well, because an
 * empty list states no extra routing at all.
 *
 * @param context - The decorator context
 * @param field - The field name, for the diagnostic
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The routing keys, or `undefined` when the field was absent, empty,
 * or rejected
 * @internal
 */
export function routingKeys(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): string[] | undefined {
  return stringListField(
    context,
    AMQP_BINDING_PROTOCOL,
    field,
    value,
    "a list of routing keys",
    target,
  );
}

/**
 * Checks a name of an exchange or a queue.
 *
 * AMQP limits the name to 255 characters. A longer one is reported and
 * dropped, and the rest of the object is kept.
 */
function topologyName(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): string | undefined {
  return boundedName(
    context,
    AMQP_BINDING_PROTOCOL,
    field,
    value as string | undefined,
    MAX_NAME_LENGTH,
    target,
  );
}

/**
 * Reads one sub-object of the channel binding.
 *
 * `exchange` and `queue` are the two, and neither is a Schema Object. Each
 * one is a fixed set of fields, so it is read field by field rather than
 * passed through. A key the author misspelled would otherwise reach the
 * document and describe a topology no broker builds.
 *
 * A sub-object with nothing left in it is dropped. An empty object states no
 * exchange or queue at all.
 */
function topology<T extends object>(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
  read: (plain: Record<string, unknown>) => T,
): T | undefined {
  const plain = objectField(context, AMQP_BINDING_PROTOCOL, field, value, target);
  if (plain === undefined) return undefined;
  return nonEmptyObject(read(plain));
}

/**
 * Checks the `exchange` field of the channel binding.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The exchange, or `undefined` when it was absent, empty, or not an
 * object
 * @internal
 */
export function exchange(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): AmqpExchangeObject | undefined {
  return topology(context, "exchange", value, target, (plain) => ({
    ...present("name", topologyName(context, "exchange.name", plain.name, target)),
    ...present(
      "type",
      enumeratedField(
        context,
        AMQP_BINDING_PROTOCOL,
        "exchange.type",
        plain.type as string | undefined,
        EXCHANGE_TYPES,
        target,
      ),
    ),
    ...present("durable", plain.durable as boolean | undefined),
    ...present("autoDelete", plain.autoDelete as boolean | undefined),
    ...present("vhost", trimmed(plain.vhost as string | undefined)),
  }));
}

/**
 * Checks the `queue` field of the channel binding.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The queue, or `undefined` when it was absent, empty, or not an
 * object
 * @internal
 */
export function queue(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): AmqpQueueObject | undefined {
  return topology(context, "queue", value, target, (plain) => ({
    ...present("name", topologyName(context, "queue.name", plain.name, target)),
    ...present("durable", plain.durable as boolean | undefined),
    ...present("exclusive", plain.exclusive as boolean | undefined),
    ...present("autoDelete", plain.autoDelete as boolean | undefined),
    ...present("vhost", trimmed(plain.vhost as string | undefined)),
  }));
}
