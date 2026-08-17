/**
 * The recorded shape of every Kafka binding, and the field checks the four
 * decorators share.
 *
 * A decorator records only the fields that survived its checks. A field the
 * author left out, or one that a check rejected, is stored as absent. So the
 * renderer never has to ask a second time whether a field is usable.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { KAFKA_BINDING_PROTOCOL } from "../../../constants.js";
import { reportDiagnostic } from "../../../lib.js";
import { trimmed } from "../../../optional-fields.js";
import { isPlainObject, toPlainValue } from "../../../marshalled-values.js";
import {
  KafkaChannelBindingObject,
  KafkaMessageBindingObject,
  KafkaOperationBindingObject,
  KafkaServerBindingObject,
} from "../../../types/index.js";

/**
 * What one Kafka decorator records, for each of the four levels.
 *
 * Each one is the emitted object without `bindingVersion`. The renderer adds
 * that field, and it is the only difference between what a decorator stores
 * and what the document carries.
 *
 * Deriving these rather than writing them out twice is what keeps the two
 * from drifting. The field list of a Kafka binding is already spelled out in
 * `lib/main.tsp` for the author and in `src/types.ts` for the emitted
 * document. A third hand-written copy here would compile happily while the
 * public type said something the emitter no longer does.
 *
 * @internal
 */
export type KafkaChannelBindingState = Omit<KafkaChannelBindingObject, "bindingVersion">;

/** @internal */
export type KafkaMessageBindingState = Omit<KafkaMessageBindingObject, "bindingVersion">;

/** @internal */
export type KafkaOperationBindingState = Omit<KafkaOperationBindingObject, "bindingVersion">;

/** @internal */
export type KafkaServerBindingState = Omit<KafkaServerBindingObject, "bindingVersion">;

/** The two values the Kafka binding allows in `cleanup.policy`. */
const CLEANUP_POLICY_VALUES = ["delete", "compact"];

/** The key of the retention policy inside `topicConfiguration`. */
const CLEANUP_POLICY_KEY = "cleanup.policy";

/** The two places the Kafka binding allows a schema id to sit. */
const SCHEMA_ID_LOCATIONS = ["header", "payload"];

/**
 * Reports one field of a Kafka binding that carries a value the binding
 * specification forbids.
 *
 * One diagnostic code covers every such rule. The code carries the protocol,
 * the field and what the field expects, so a new rule adds a call rather than
 * a code.
 */
function reportField(
  context: DecoratorContext,
  field: string,
  expected: string,
  target: DiagnosticTarget,
): void {
  reportDiagnostic(context.program, {
    code: "invalid-binding-field",
    format: { protocol: KAFKA_BINDING_PROTOCOL, field, expected },
    target,
  });
}

/**
 * Checks one count field of the channel binding.
 *
 * The Kafka binding states that `partitions` and `replicas` are positive
 * integers. Zero partitions describe no topic at all. The declared type is
 * `int32`, so the value is already whole and only the sign is checked here.
 *
 * @param context - The decorator context
 * @param field - The field name, for the diagnostic
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function positiveCount(
  context: DecoratorContext,
  field: string,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (value <= 0) {
    reportField(context, field, "a positive integer", target);
    return undefined;
  }
  return value;
}

/**
 * Checks the `schemaIdLocation` field of the message binding.
 *
 * The Kafka binding allows `header` and `payload` and nothing else. A value
 * outside that set names a place no consumer looks in.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function schemaIdLocation(
  context: DecoratorContext,
  value: string | undefined,
  target: DiagnosticTarget,
): string | undefined {
  // The value is trimmed before the check, so `" payload "` names the place
  // the author meant rather than being rejected over its spacing.
  const location = trimmed(value);
  if (location === undefined) return undefined;
  if (!SCHEMA_ID_LOCATIONS.includes(location)) {
    reportField(context, "schemaIdLocation", SCHEMA_ID_LOCATIONS.join(" or "), target);
    return undefined;
  }
  return location;
}

/**
 * Checks one Schema Object field of a Kafka binding.
 *
 * `key`, `groupId` and `clientId` are Schema Objects in the Kafka binding.
 * The value is written as an object literal and is emitted as written. A
 * scalar or an array is not a Schema Object, so it is reported and dropped.
 *
 * @param context - The decorator context
 * @param field - The field name, for the diagnostic
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The plain JSON object, or `undefined` when it was absent or
 * rejected
 * @internal
 */
export function schemaField(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!isPlainObject(plain)) {
    reportField(context, field, "a schema object", target);
    return undefined;
  }
  return plain;
}

/**
 * Checks the `topicConfiguration` field of the channel binding.
 *
 * The map passes through untouched, apart from the one rule the binding
 * states about a value. The declared type is `Record<unknown>`, so the value
 * is already a map by the time it arrives. AsyncAPI allows this object to carry additional
 * properties, and its own keys hold dots, so a vendor key such as
 * `confluent.value.schema.validation` stays legal here.
 *
 * The one rule is `cleanup.policy`. Kafka accepts `delete` and `compact`, and
 * the field is a list, so each entry is checked. A list that holds any other
 * entry is reported and the whole field is dropped.
 *
 * A single value is accepted in place of a list, and it is emitted as a
 * one-entry list. The binding types this field as an array, so emitting the
 * bare string would write a document the AsyncAPI parser rejects.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The plain JSON object, or `undefined` when it was absent, empty,
 * or rejected by the `cleanup.policy` rule
 * @internal
 */
export function topicConfiguration(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value) as Record<string, unknown>;
  if (Object.keys(plain).length === 0) return undefined;
  const policy = plain[CLEANUP_POLICY_KEY];
  if (policy !== undefined) {
    const entries = Array.isArray(policy) ? policy : [policy];
    if (entries.every((entry) => CLEANUP_POLICY_VALUES.includes(entry as string))) {
      plain[CLEANUP_POLICY_KEY] = entries;
    } else {
      // Only this key goes. The map holds whatever else the author wrote,
      // including keys this emitter never heard of, and one bad value is no
      // reason to drop them. Returning `undefined` here would take the whole
      // map away while the diagnostic says the rest of the binding was kept.
      reportField(context, CLEANUP_POLICY_KEY, CLEANUP_POLICY_VALUES.join(" or "), target);
      const kept = Object.fromEntries(
        Object.entries(plain).filter(([key]) => key !== CLEANUP_POLICY_KEY),
      );
      return Object.keys(kept).length > 0 ? kept : undefined;
    }
  }
  return plain;
}
