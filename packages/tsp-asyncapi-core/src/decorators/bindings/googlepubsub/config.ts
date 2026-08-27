/**
 * The recorded shape of both Google Cloud Pub/Sub bindings, and the field
 * checks they share.
 *
 * Two objects here carry required fields of their own. `schemaSettings` needs
 * an encoding and a name. `schema` needs a name. An object missing one of
 * them is reported, and the caller then decides what to drop.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { GOOGLE_PUB_SUB_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import type {
  GooglePubSubChannelBindingObject,
  GooglePubSubMessageBindingObject,
  GooglePubSubSchemaObject,
  GooglePubSubSchemaSettingsObject,
  GooglePubSubStoragePolicyObject,
} from "../../../types/index.js";
import {
  NestedRead,
  nonEmptyObject,
  objectField,
  requiredFields,
  stringListField,
} from "../fields.js";

/**
 * What each Google Cloud Pub/Sub decorator records.
 *
 * Each one is the emitted object without `bindingVersion`. That field is
 * appended when the document is built.
 * @internal
 */
export type GooglePubSubChannelBindingState = Omit<
  GooglePubSubChannelBindingObject,
  "bindingVersion"
>;

/** @internal */
export type GooglePubSubMessageBindingState = Omit<
  GooglePubSubMessageBindingObject,
  "bindingVersion"
>;

/** The fields `schemaSettings` requires. */
const REQUIRED_SCHEMA_SETTINGS = ["encoding", "name"];

/** Reads one object field, naming the protocol for the caller. */
function pubSubObject(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  return objectField(context, GOOGLE_PUB_SUB_BINDING_PROTOCOL, field, value, target);
}

/**
 * Checks the `schemaSettings` field of the channel binding.
 *
 * The object is required, and it requires an encoding and a name of its own.
 * A missing one is reported and the whole object is refused, because a schema
 * setting without a name names no schema.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The schema settings, `dropped` when the object was not an object,
 * or `incomplete` when a required field is absent
 * @internal
 */
export function schemaSettings(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): NestedRead<GooglePubSubSchemaSettingsObject> {
  const plain = pubSubObject(context, "schemaSettings", value, target);
  if (plain === undefined) return { outcome: "dropped" };

  const path = "schemaSettings";
  if (
    !requiredFields(
      context,
      GOOGLE_PUB_SUB_BINDING_PROTOCOL,
      path,
      plain,
      REQUIRED_SCHEMA_SETTINGS,
      target,
    )
  ) {
    return { outcome: "incomplete" };
  }

  return {
    outcome: "read",
    value: {
      encoding: (plain.encoding as string).trim(),
      name: (plain.name as string).trim(),
      ...present("firstRevisionId", trimmed(plain.firstRevisionId as string | undefined)),
      ...present("lastRevisionId", trimmed(plain.lastRevisionId as string | undefined)),
    },
  };
}

/**
 * Checks the `messageStoragePolicy` field of the channel binding.
 *
 * A policy with no region left in it is dropped. An empty policy states no
 * restriction, which is what an absent field already says.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The storage policy, or `undefined` when it was absent or empty
 * @internal
 */
export function messageStoragePolicy(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): GooglePubSubStoragePolicyObject | undefined {
  const plain = pubSubObject(context, "messageStoragePolicy", value, target);
  if (plain === undefined) return undefined;

  const regions = stringListField(
    context,
    GOOGLE_PUB_SUB_BINDING_PROTOCOL,
    "messageStoragePolicy.allowedPersistenceRegions",
    plain.allowedPersistenceRegions,
    "a list of region names",
    target,
  );
  return regions === undefined ? undefined : { allowedPersistenceRegions: regions };
}

/**
 * Checks an open map field, such as `labels` or `attributes`.
 *
 * Pub/Sub puts no rule on the keys or the values, so the map passes through
 * as written. An empty map is dropped, because it states nothing.
 *
 * @param context - The decorator context
 * @param field - The field name, for the diagnostic
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The map, or `undefined` when it was absent, empty, or not an
 * object
 * @internal
 */
export function openMap(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  return nonEmptyObject(pubSubObject(context, field, value, target));
}

/**
 * Checks the `schema` field of the message binding.
 *
 * The object requires a name. Unlike `schemaSettings` the object itself is
 * optional, so an absent one is not reported.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The schema, `dropped` when it was absent or not an object, or
 * `incomplete` when it has no name
 * @internal
 */
export function messageSchema(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): NestedRead<GooglePubSubSchemaObject> {
  const plain = pubSubObject(context, "schema", value, target);
  if (plain === undefined) return { outcome: "dropped" };

  if (
    !requiredFields(context, GOOGLE_PUB_SUB_BINDING_PROTOCOL, "schema", plain, ["name"], target)
  ) {
    return { outcome: "incomplete" };
  }
  return { outcome: "read", value: { name: (plain.name as string).trim() } };
}
