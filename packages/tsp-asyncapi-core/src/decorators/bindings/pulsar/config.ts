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
import type {
  PulsarChannelBindingObject,
  PulsarRetentionObject,
  PulsarServerBindingObject,
} from "../../../types/index.js";
import {
  enumeratedField,
  nonEmptyObject,
  nonNegativeField,
  objectField,
  stringListField,
} from "../fields.js";

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
 * The binding requires the field, so a rejected value costs the whole
 * binding. The loss is `binding` for that reason. A warning about one dropped
 * field would promise the author a document the emitter never writes.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 *
 * @returns The value, or `undefined` when it was absent or rejected
 *
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
    "binding",
  );
}

/**
 * Checks one measure of the retention policy.
 *
 * Pulsar states both as zero or more. Zero disables retention on that
 * measure, so it is a value rather than an absent field.
 *
 * @param context - The decorator context
 * @param field - The field name
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 */
function retentionMeasure(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): number | undefined {
  return nonNegativeField(
    context,
    PULSAR_BINDING_PROTOCOL,
    field,
    value as number | undefined,
    undefined,
    target,
  );
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
 *
 * @returns The retention policy, or `undefined` when it was absent, empty, or
 * not an object
 *
 * @internal
 */
export function retention(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): PulsarRetentionObject | undefined {
  const plain = objectField(context, PULSAR_BINDING_PROTOCOL, "retention", value, target);
  if (plain === undefined) return undefined;
  const policy: PulsarRetentionObject = {
    ...present("time", retentionMeasure(context, "retention.time", plain.time, target)),
    ...present("size", retentionMeasure(context, "retention.size", plain.size, target)),
  };
  return nonEmptyObject(policy);
}

/**
 * Checks the `compaction` field of the channel binding.
 *
 * Pulsar states the threshold in megabytes, and a size is never negative.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 *
 * @returns The value, or `undefined` when it was absent or rejected
 *
 * @internal
 */
export function compaction(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  return nonNegativeField(context, PULSAR_BINDING_PROTOCOL, "compaction", value, undefined, target);
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
 *
 * @returns The cluster names, or `undefined` when the field was absent, empty,
 * or not a list
 *
 * @internal
 */
export function geoReplication(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): string[] | undefined {
  return stringListField(
    context,
    PULSAR_BINDING_PROTOCOL,
    "geo-replication",
    value,
    "a list of cluster names",
    target,
  );
}
