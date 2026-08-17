/**
 * The field checks every protocol binding shares.
 *
 * A binding specification states rules about its own fields. Two rules recur
 * across protocols: a field must hold one of a fixed set of values, and a
 * field must hold a Schema Object. Both are checked here, and the protocol
 * name arrives as an argument.
 *
 * One diagnostic code covers all of them. The code carries the protocol, the
 * field and what the field expects, so a new rule adds a call rather than a
 * code.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { trimmed } from "../../optional-fields.js";
import { isPlainObject, toPlainValue } from "../../marshalled-values.js";

/**
 * Reports one field of a binding that carries a value the binding
 * specification forbids.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to, such as `kafka`
 * @param field - The field name
 * @param expected - What the field expects, in the author's words
 * @param target - Where the problem is reported
 * @internal
 */
export function reportBindingField(
  context: DecoratorContext,
  protocol: string,
  field: string,
  expected: string,
  target: DiagnosticTarget,
): void {
  reportDiagnostic(context.program, {
    code: "invalid-binding-field",
    format: { protocol, field, expected },
    target,
  });
}

/**
 * Checks one field that a binding limits to a fixed set of values.
 *
 * The value is trimmed before the check, so `" payload "` names the value the
 * author meant rather than being rejected over its spacing.
 *
 * @param context - The decorator context
 * @param protocol - The protocol the field belongs to
 * @param field - The field name
 * @param value - The field as the author wrote it
 * @param allowed - The values the binding specification allows
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function enumeratedField<T extends string>(
  context: DecoratorContext,
  protocol: string,
  field: string,
  value: string | undefined,
  allowed: readonly T[],
  target: DiagnosticTarget,
): T | undefined {
  const written = trimmed(value);
  if (written === undefined) return undefined;
  if (!allowed.includes(written as T)) {
    reportBindingField(context, protocol, field, allowed.join(" or "), target);
    return undefined;
  }
  return written as T;
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
 * @returns The plain JSON object, or `undefined` when it was absent or
 * rejected
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
