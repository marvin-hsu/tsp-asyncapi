/**
 * The field checks every protocol binding shares.
 *
 * A binding specification states rules about its own fields. Common rules
 * recur across protocols: a fixed set of values, a Schema Object, a
 * non-negative number, a name length limit, or a required field. Each rule
 * is checked here. The protocol name arrives as an argument. A protocol
 * that states a rule of its own, such as Kafka's `cleanup.policy`, keeps
 * that check in its own directory instead.
 *
 * Three diagnostic codes cover these checks. `invalid-binding-field` is a
 * warning: it reports a rejected value and keeps the rest of the binding.
 * `invalid-required-binding-field` reports the same rejection on a required
 * field, as an error that drops the whole binding. `missing-binding-field`
 * is also an error, reported when a required field is missing entirely.
 *
 * Every check here follows one rule: a decorator records only the fields
 * that survived. A field left out, or one a check rejected, is stored as
 * absent, so nothing downstream needs to ask twice whether it is usable.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { trimmed } from "../../optional-fields.js";
import { isPlainObject, toPlainValue } from "../../marshalled-values.js";

/**
 * What a rejected field costs the author.
 *
 * `field` takes only the field away. The rest of the binding is emitted, and
 * the report is a warning.
 *
 * `binding` takes the whole binding with it, and the report is an error. Two
 * kinds of field cost that much. One is a field the binding requires. The
 * other is an optional object the author declared and the emitter cannot
 * read. A binding emitted without such an object describes less than the
 * source does.
 *
 * The caller names the loss. Only the caller knows what the binding is worth
 * without the field.
 * @internal
 */
export type FieldLoss = "field" | "binding";

/**
 * Reports one field of a binding that carries a value the binding
 * specification forbids. Costs only the field unless the caller passes
 * `binding` as `loss`.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to, such as `kafka`
 * @param field - The field name
 * @param expected - What the field expects, in the author's words
 * @param target - Where the problem is reported
 * @param loss - What the rejected field costs. It is the field alone unless the
 * caller says otherwise.
 *
 * @internal
 */
export function reportBindingField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  expected: string,
  target: DiagnosticTarget,
  loss: FieldLoss = "field",
): void {
  reportDiagnostic(context.program, {
    code: loss === "binding" ? "invalid-required-binding-field" : "invalid-binding-field",
    format: { protocol, field, expected },
    target,
  });
}

/**
 * Checks one field that a binding limits to a fixed set of values.
 *
 * The value is trimmed before the check, so `" payload "` matches `payload`
 * instead of being rejected over its spacing. Returns `undefined` when the
 * value was absent or rejected.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it
 * @param allowed - The values the binding specification allows
 * @param target - Where a problem is reported
 * @param loss - What a rejected value costs. Pass `binding` where the binding
 * requires the field.
 *
 * @returns The value, or `undefined` when it was absent or rejected
 *
 * @internal
 */
export function enumeratedField<T extends string>(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: string | undefined,
  allowed: readonly T[],
  target: DiagnosticTarget,
  loss: FieldLoss = "field",
): T | undefined {
  const written = trimmed(value);
  if (written === undefined) return undefined;
  if (!allowed.includes(written as T)) {
    reportBindingField(context, protocol, field, allowed.join(" or "), target, loss);
    return undefined;
  }
  return written as T;
}

/**
 * Checks one field a binding states as an object.
 *
 * Several bindings nest an object that is not a Schema Object. The exchange
 * of an AMQP channel and the Last Will of an MQTT server are two of them. A
 * scalar or an array describes neither, so it is reported and dropped.
 *
 * The object comes back as the author wrote it, even when it has no field.
 * This check never drops an empty object on its own. A caller that reads
 * required fields out of the object reports those first. Pass the result
 * through `nonEmptyObject` where an empty object states nothing.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @param loss - What a rejected object costs. Pass `binding` where the binding
 * requires the object.
 *
 * @returns The plain JSON object, or `undefined` when it was absent or rejected
 *
 * @internal
 */
export function objectField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
  loss: FieldLoss = "field",
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!isPlainObject(plain)) {
    reportBindingField(context, protocol, field, "an object", target, loss);
    return undefined;
  }
  return plain;
}

/**
 * Drops a nested binding object that has no field left in it.
 *
 * An object with no field states nothing, the same as an absent field.
 * Every binding here drops the empty one, so no two protocols answer the
 * same source in different ways. An object arrives empty because the
 * author wrote it empty, or because every field in it was reported and
 * dropped.
 *
 * @param value - The object to check
 * @returns The object, or `undefined` when it is absent or has no field
 *
 * @internal
 */
export function nonEmptyObject<T extends object>(value: T | undefined): T | undefined {
  if (value === undefined) return undefined;
  return Object.keys(value).length > 0 ? value : undefined;
}

/**
 * Checks one field a binding states as zero or more.
 *
 * Six fields across five bindings state a length of time, a size or a
 * priority. None of them is ever negative. Zero is a valid value on all of
 * them, because it turns the delay, the retention or the timeout off. Only
 * a negative value is reported. `measure` names the unit, such as
 * `seconds`, for the diagnostic. Pass `undefined` where the binding states
 * no unit.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it
 * @param measure - What the number counts, such as `seconds`. Pass `undefined`
 * where the binding states no unit.
 * @param target - Where a problem is reported
 *
 * @returns The value, or `undefined` when it was absent or rejected
 *
 * @internal
 */
export function nonNegativeField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: number | undefined,
  measure: string | undefined,
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (value < 0) {
    const expected = measure === undefined ? "zero or more" : `zero or more ${measure}`;
    reportBindingField(context, protocol, field, expected, target);
    return undefined;
  }
  return value;
}

/**
 * Checks one field a binding states as a list.
 *
 * The entries are not checked here. Each binding states its own rule about
 * them, and some state none at all. This check answers one question only:
 * whether the author wrote a list. `expected` names what the list holds, so
 * AMQP can report `a list of routing keys` rather than `a list`.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it, still marshalled
 * @param expected - What the list holds, in the author's words
 * @param target - Where a problem is reported
 * @param loss - What a rejected list costs. Pass `binding` where the binding
 * requires the list.
 *
 * @returns The entries, or `undefined` when the field was absent or rejected
 *
 * @internal
 */
export function listField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: unknown,
  expected: string,
  target: DiagnosticTarget,
  loss: FieldLoss = "field",
): unknown[] | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!Array.isArray(plain)) {
    reportBindingField(context, protocol, field, expected, target, loss);
    return undefined;
  }
  // `Array.isArray` narrows an `unknown` to `any[]`, and the entries are
  // whatever the author wrote. The caller checks them.
  return plain as unknown[];
}

/**
 * Checks one field a binding states as a list of names.
 *
 * A blank entry names nothing, so it is dropped. A list left with no entry
 * is dropped too, since an empty list states no routing, no replication and
 * no region, the same as an absent field.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it, still marshalled
 * @param expected - What the list holds, in the author's words
 * @param target - Where a problem is reported
 *
 * @returns The names, or `undefined` when the field was absent, empty, or
 * rejected
 *
 * @internal
 */
export function stringListField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: unknown,
  expected: string,
  target: DiagnosticTarget,
): string[] | undefined {
  const plain = listField(context, protocol, field, value, expected, target);
  if (plain === undefined) return undefined;
  const names = plain
    .map((entry) => trimmed(entry as string))
    .filter((entry): entry is string => entry !== undefined);
  return names.length > 0 ? names : undefined;
}

/**
 * Checks one name field a binding limits to a length.
 *
 * AMQP allows 255 characters in the name of an exchange or a queue. Solace
 * allows 160 in a client name. A broker refuses a longer name at connect
 * time, so emitting one would describe a topology no broker builds.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it
 * @param maxLength - The longest name the binding allows
 * @param target - Where a problem is reported
 *
 * @returns The trimmed name, or `undefined` when it was absent, blank, or too
 * long
 *
 * @internal
 */
export function boundedName(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: string | undefined,
  maxLength: number,
  target: DiagnosticTarget,
): string | undefined {
  const name = trimmed(value);
  if (name === undefined) return undefined;
  if (name.length > maxLength) {
    reportBindingField(context, protocol, field, `at most ${String(maxLength)} characters`, target);
    return undefined;
  }
  return name;
}

/**
 * Checks one Schema Object field of a binding.
 *
 * The value is written as an object literal and is emitted as written. A
 * scalar or an array is not a Schema Object, so it is reported and dropped.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 *
 * @returns The plain JSON object, or `undefined` when it was absent or rejected
 *
 * @internal
 */
export function schemaField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (!isPlainObject(plain)) {
    reportBindingField(context, protocol, field, "a schema object", target);
    return undefined;
  }
  return plain;
}

/**
 * Checks one field that a binding limits to a fixed set of numbers.
 *
 * MQTT states its quality of service as `0`, `1` or `2`, and its payload
 * format indicator as `0` or `1`. A value outside the set names a mode no
 * broker implements. The declared type is `int32`, so the value is already
 * whole by the time it arrives. Only membership is checked here.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it
 * @param allowed - The values the binding specification allows
 * @param target - Where a problem is reported
 *
 * @returns The value, or `undefined` when it was absent or rejected
 *
 * @internal
 */
export function numericField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: number | undefined,
  allowed: readonly number[],
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) {
    reportBindingField(context, protocol, field, allowed.join(", "), target);
    return undefined;
  }
  return value;
}

/**
 * Checks one field a binding types as a number or a Schema Object.
 *
 * MQTT 5 states four fields this way. Each one holds a fixed value, or a
 * schema that describes the value, and both reach the document as written.
 * A string, a boolean or an array is neither, so it is reported and dropped.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 *
 * @returns The number or the plain JSON object, or `undefined` when the field
 * was absent or rejected
 *
 * @internal
 */
export function numberOrSchemaField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): number | Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (typeof plain === "number") return plain;
  if (isPlainObject(plain)) return plain;
  reportBindingField(context, protocol, field, "a number or a schema object", target);
  return undefined;
}

/**
 * Checks one field a binding types as a string or a Schema Object.
 *
 * MQTT states `responseTopic` this way. It holds a topic name, or a schema
 * that describes the name, and both reach the document as written. A blank
 * string is dropped without a report, since an author who wrote spaces
 * meant no topic rather than a topic called spaces.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 *
 * @returns The string or the plain JSON object, or `undefined` when the field
 * was absent, blank, or rejected
 *
 * @internal
 */
export function stringOrSchemaField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): string | Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const plain = toPlainValue(context.program, value);
  if (typeof plain === "string") return trimmed(plain);
  if (isPlainObject(plain)) return plain;
  reportBindingField(context, protocol, field, "a topic name or a schema object", target);
  return undefined;
}

/**
 * Checks one Schema Object field that must describe a set of named values.
 *
 * The WebSocket and HTTP bindings both state this rule, for the query
 * parameters and the headers of a request. The schema must be of type
 * `object` and must have a `properties` key. A schema that says neither
 * describes no parameter, so a generator reading it produces a request with
 * nothing in it. A `$ref` passes without either key, since the reference
 * names a schema that lives elsewhere and this emitter does not follow it.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 *
 * @returns The plain JSON object, or `undefined` when it was absent or rejected
 *
 * @internal
 */
export function namedValuesSchemaField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  const schema = schemaField(context, protocol, field, value, target);
  if (schema === undefined) return undefined;
  if (schema.$ref !== undefined) return schema;
  if (schema.type !== "object" || schema.properties === undefined) {
    reportBindingField(
      context,
      protocol,
      field,
      'an object schema with a "properties" key',
      target,
    );
    return undefined;
  }
  return schema;
}

/**
 * Reports a field the binding specification requires and the author left out.
 *
 * The caller drops the whole binding after this call. AsyncAPI would reject
 * the emitted document if it kept a binding missing a required field, and
 * the resulting error would name the emitter rather than the source.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field the specification requires
 * @param target - Where the problem is reported
 *
 * @internal
 */
export function reportMissingField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  target: DiagnosticTarget,
): void {
  reportDiagnostic(context.program, {
    code: "missing-binding-field",
    format: { protocol, field },
    target,
  });
}

/**
 * What one read of a nested binding object produced.
 *
 * A nested object fails in two ways that cost different amounts. A field
 * outside what the specification allows takes only itself away. A required
 * field the author left out reports `missing-binding-field`, and the whole
 * binding goes with it. Only the decorator that owns the object knows what
 * the binding is worth without it, so the reader names the outcome and the
 * decorator acts on it.
 *
 * `dropped` costs the whole binding at some call sites: the `queue` and
 * `deadLetterQueue` of an SQS channel, the `queues` of an SQS operation, and
 * the `schemaSettings` of a Google Cloud Pub/Sub channel. Each passes
 * `binding` as its `FieldLoss`, so the report is `invalid-required-binding-field`.
 * @internal
 */
export type NestedRead<T> =
  | { readonly outcome: "read"; readonly value: T }
  | { readonly outcome: "dropped" }
  | { readonly outcome: "incomplete" };

/**
 * Reports every required field a nested binding object does not carry.
 *
 * The diagnostic names the path rather than the field alone. A queue of an
 * SQS channel reports `deadLetterQueue.name`, so the author reads which of
 * the two queues is short of a name.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the object belongs to
 * @param path - The path of the object, such as `deadLetterQueue`
 * @param value - The object the author wrote
 * @param required - The field names the specification requires
 * @param target - Where the problems are reported
 *
 * @returns Whether the object carries every required field
 *
 * @internal
 */
export function requiredFields(
  context: DecoratorContext,
  protocol: string,
  path: string,
  value: Record<string, unknown>,
  required: readonly string[],
  target: DiagnosticTarget,
): boolean {
  const missing = missingFields(value, required);
  for (const field of missing) {
    reportMissingField(context, protocol, `${path}.${field}`, target);
  }
  return missing.length === 0;
}

/**
 * Names the fields a nested binding object requires but does not carry.
 *
 * Several bindings nest an object that has required fields of its own. The
 * queue of an SQS channel needs a name and a FIFO flag. The schema settings
 * of a Google Pub/Sub channel need an encoding and a name.
 *
 * A blank string counts as absent, since a broker or a generator can do no
 * more with it than with no field at all.
 *
 * @param value - The object the author wrote
 * @param required - The field names the specification requires
 * @returns The required fields the object does not carry, in the order given
 *
 * @internal
 */
export function missingFields(
  value: Record<string, unknown>,
  required: readonly string[],
): string[] {
  return required.filter((field) => {
    const written = value[field];
    if (written === undefined || written === null) return true;
    return typeof written === "string" && written.trim() === "";
  });
}
