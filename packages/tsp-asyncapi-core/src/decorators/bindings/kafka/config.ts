/**
 * The recorded shape of every Kafka binding, and the field checks the four
 * decorators share.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { KAFKA_BINDING_PROTOCOL } from "../../../constants.js";
import {
  enumeratedField,
  nonEmptyObject,
  objectField,
  reportBindingField,
  schemaField,
} from "../fields.js";
import type {
  KafkaChannelBindingObject,
  KafkaMessageBindingObject,
  KafkaOperationBindingObject,
  KafkaServerBindingObject,
} from "../../../types/index.js";

/**
 * What one Kafka decorator records, for each of the four levels.
 *
 * Each one is the emitted object without `bindingVersion`. That field is
 * appended when the document is built, and it is the only difference between
 * what a decorator stores and what the document carries.
 *
 * Deriving these rather than writing them out twice is what keeps the two
 * from drifting. The field list of a Kafka binding is already spelled out in
 * `lib/main.tsp` for the author and in `src/types/bindings.ts` for the
 * emitted document. A third hand-written copy here would compile happily
 * while the public type said something the emitter no longer does.
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

/** Reports one field of a Kafka binding, naming the protocol for the caller. */
function reportField(
  context: DecoratorContext,
  field: string,
  expected: string,
  target: DiagnosticTarget,
): void {
  reportBindingField(context, KAFKA_BINDING_PROTOCOL, field, expected, target);
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
  return enumeratedField(
    context,
    KAFKA_BINDING_PROTOCOL,
    "schemaIdLocation",
    value,
    SCHEMA_ID_LOCATIONS,
    target,
  );
}

/**
 * Checks one Schema Object field of a Kafka binding.
 *
 * `key`, `groupId` and `clientId` are Schema Objects in the Kafka binding.
 *
 * @param context - The decorator context
 * @param field - The field name, for the diagnostic
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The plain JSON object, or `undefined` when it was absent or
 * rejected
 * @internal
 */
export function kafkaSchemaField(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  return schemaField(context, KAFKA_BINDING_PROTOCOL, field, value, target);
}

/**
 * Checks the `topicConfiguration` field of the channel binding.
 *
 * The map passes through untouched, apart from the one rule the binding
 * states about a value. AsyncAPI allows this object to carry additional
 * properties, and its own keys hold dots, so a vendor key such as
 * `confluent.value.schema.validation` stays legal here.
 *
 * The declared type is `Record<unknown>`, so the checker already refused a
 * scalar here. The map still arrives as no object at all when one member is a
 * value the serializer cannot represent. A custom scalar with an `init` is
 * one. That member fails the whole map, so the field is reported and dropped.
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
  const plain = objectField(context, KAFKA_BINDING_PROTOCOL, "topicConfiguration", value, target);
  if (plain === undefined) return undefined;
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
      return nonEmptyObject(kept);
    }
  }
  return nonEmptyObject(plain);
}
