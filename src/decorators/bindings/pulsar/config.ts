/**
 * The recorded shape of both Pulsar bindings, and the field checks they
 * share.
 *
 * The channel binding carries required fields. A binding missing one of them
 * cannot be written as a valid document, so the whole binding is dropped
 * rather than emitted in part.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { PULSAR_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import { isPlainObject, toPlainValue } from "../../../marshalled-values.js";
import {
  PulsarChannelBindingObject,
  PulsarRetentionObject,
  PulsarServerBindingObject,
} from "../../../types/index.js";
import { enumeratedField, reportBindingField } from "../fields.js";

/**
 * What each Pulsar decorator records.
 *
 * Each one is the emitted object without `bindingVersion`. That field is
 * appended when the document is built.
 * @internal
 */
export type PulsarServerBindingState = Omit<PulsarServerBindingObject, "bindingVersion">;

/** @internal */
export type PulsarChannelBindingState = Omit<PulsarChannelBindingObject, "bindingVersion">;

/** The two ways Pulsar stores a topic. */
const PERSISTENCE_VALUES = ["persistent", "non-persistent"];

/**
 * Checks the `persistence` field of the channel binding.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function persistence(
  context: DecoratorContext,
  value: string | undefined,
  target: DiagnosticTarget,
): string | undefined {
  return enumeratedField(
    context,
    PULSAR_BINDING_PROTOCOL,
    "persistence",
    value,
    PERSISTENCE_VALUES,
    target,
  );
}

/**
 * Checks one measure of the retention policy.
 *
 * Pulsar states both as zero or more. Zero disables retention on that
 * measure, so it is a value rather than an absent field.
 */
function retentionMeasure(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  const measure = value as number;
  if (measure < 0) {
    reportBindingField(context, PULSAR_BINDING_PROTOCOL, field, "zero or more", target);
    return undefined;
  }
  return measure;
}

/**
 * Checks the `retention` field of the channel binding.
 *
 * A policy with nothing left in it is dropped. An empty object states no
 * retention policy at all, which is not what a zero says.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The retention policy, or `undefined` when it was absent, empty, or
 * not an object
 * @internal
 */
export function retention(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): PulsarRetentionObject | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!isPlainObject(plain)) {
    reportBindingField(context, PULSAR_BINDING_PROTOCOL, "retention", "an object", target);
    return undefined;
  }
  const policy: PulsarRetentionObject = {
    ...present("time", retentionMeasure(context, "retention.time", plain.time, target)),
    ...present("size", retentionMeasure(context, "retention.size", plain.size, target)),
  };
  return Object.keys(policy).length > 0 ? policy : undefined;
}

/**
 * Checks the `compaction` field of the channel binding.
 *
 * Pulsar states the threshold in megabytes, and a size is never negative.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function compaction(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (value < 0) {
    reportBindingField(context, PULSAR_BINDING_PROTOCOL, "compaction", "zero or more", target);
    return undefined;
  }
  return value;
}

/**
 * Checks the `geo-replication` field of the channel binding.
 *
 * A blank entry names no cluster, so it is dropped. A list left with nothing
 * in it is dropped as well, because an empty list states no replication.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The cluster names, or `undefined` when the field was absent,
 * empty, or not a list
 * @internal
 */
export function geoReplication(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): string[] | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!Array.isArray(plain)) {
    reportBindingField(
      context,
      PULSAR_BINDING_PROTOCOL,
      "geo-replication",
      "a list of cluster names",
      target,
    );
    return undefined;
  }
  const clusters = plain
    .map((entry) => (entry as string).trim())
    .filter((entry) => entry.length > 0);
  return clusters.length > 0 ? clusters : undefined;
}
