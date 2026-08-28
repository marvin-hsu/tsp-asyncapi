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
 * The map passes through untouched except for `cleanup.policy`. AsyncAPI
 * allows this object to carry additional properties, and Kafka's own keys
 * hold dots, so a vendor key such as `confluent.value.schema.validation`
 * stays legal here.
 *
 * The declared type is `Record<unknown>`, so the checker already refused a
 * scalar. The map can still arrive as no object at all: a member that is a
 * custom scalar with an `init` fails serialization, and that fails the whole
 * map, so the field is reported and dropped.
 *
 * `cleanup.policy` is a list, and Kafka accepts only `delete` and `compact`
 * as entries. A list holding any other entry is reported, and the whole
 * field is dropped. A single value in place of a list is accepted and
 * emitted as a one-entry list, since the binding types this field as an
 * array.
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
