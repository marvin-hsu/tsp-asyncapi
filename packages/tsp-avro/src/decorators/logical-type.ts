/**
 * The `@logicalType` and `@decimal` decorators, and their reader,
 * `getAvroLogicalType`.
 *
 * Both decorators write to one piece of state, because a decimal is a
 * logical type that also carries precision and scale. This file checks the
 * shape of what an author wrote, such as a positive precision, and refuses a
 * second logical type on the same target. It does not check the logical type
 * against its underlying type; the walk refuses that pairing when it builds
 * the schema.
 */

import { DecoratorContext, ModelProperty, Program, Scalar } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";

const logicalTypeStateKey = Symbol.for("tsp-avro.logicalType");

/**
 * What an author declared about a logical type.
 *
 * Precision and scale belong to `decimal` alone, and `decimal` is the only
 * logical type the specification gives parameters. So one shape carries both
 * decorators, and the walk decides whether the parameters were needed.
 *
 * @public
 */
export interface AvroLogicalTypeAnnotation {
  /** The logical type name, such as `timestamp-millis`. */
  readonly name: string;
  /** How many digits a decimal holds. */
  readonly precision?: number;
  /** How many of those digits sit after the point. */
  readonly scale?: number;
}

const [getLogicalTypeInternal, setLogicalTypeInternal] = useStateMap<
  Scalar | ModelProperty,
  AvroLogicalTypeAnnotation
>(logicalTypeStateKey);

/**
 * Declares the meaning Avro reads into an underlying type.
 *
 * A logical type is an annotation on a primitive or a fixed type. Avro carries
 * `timestamp-millis` as a `long`, and a reader that knows the annotation
 * builds a timestamp from it. A reader that does not know it reads the `long`,
 * which is why the annotation never changes what is on the wire.
 *
 * Each logical type goes with one underlying type, and the emitter refuses a
 * pair the specification does not name. `avsc` accepts any pair at all,
 * including a logical type nobody has defined, so this check is the only one
 * standing between an author and a schema no reader understands.
 *
 * Use `@decimal` for `decimal`. It is the one logical type that takes
 * parameters, and it is unreadable without them.
 *
 * @param context - The decorator context
 * @param target - The scalar or field the meaning belongs to
 * @param name - The logical type name, such as `uuid` or `timestamp-millis`
 *
 * @example
 * ```typespec
 * @logicalType("timestamp-millis")
 * scalar Timestamp extends int64;
 * ```
 *
 * @public
 */
export function $logicalType(
  context: DecoratorContext,
  target: Scalar | ModelProperty,
  name: string,
): void {
  recordLogicalType(context, target, { name });
}

/**
 * Records one logical type, or refuses a second one on the same target.
 *
 * `@logicalType` and `@decimal` write to one place, because a decimal is a
 * logical type with parameters. So a target that carries both would keep
 * whichever decorator ran last, and the compiler runs them from the
 * declaration outwards. Refusing says which two were written, rather than
 * dropping one without a word.
 *
 * @param context - The decorator context
 * @param target - The type this applies to
 * @param annotation - The annotation
 */
function recordLogicalType(
  context: DecoratorContext,
  target: Scalar | ModelProperty,
  annotation: AvroLogicalTypeAnnotation,
): void {
  const declared = getLogicalTypeInternal(context.program, target);
  if (declared !== undefined) {
    reportDiagnostic(context.program, {
      code: "duplicate-logical-type",
      format: { first: declared.name, second: annotation.name },
      target: context.decoratorTarget,
    });
    return;
  }

  setLogicalTypeInternal(context.program, target, annotation);
}

/**
 * Declares a decimal, which is the one logical type that takes parameters.
 *
 * Avro carries a decimal as an unscaled integer in `bytes` or in a fixed type.
 * Precision says how many digits the number holds, and scale says how many of
 * them sit after the point. Both are part of the schema, because a reader
 * cannot place the point without them.
 *
 * @param context - The decorator context
 * @param target - The scalar or field the decimal belongs to
 * @param precision - How many digits, which is a positive number
 * @param scale - How many digits sit after the point. It defaults to zero, and
 * it is never larger than the precision.
 *
 * @example
 * ```typespec
 * @decimal(9, 2)
 * scalar Money extends bytes;
 * ```
 *
 * @public
 */
export function $decimal(
  context: DecoratorContext,
  target: Scalar | ModelProperty,
  precision: number,
  scale?: number,
): void {
  if (precision <= 0) {
    reportDiagnostic(context.program, {
      code: "invalid-decimal",
      messageId: "precision",
      format: { precision: String(precision) },
      target: context.decoratorTarget,
    });
    return;
  }

  const resolved = scale ?? 0;
  if (resolved < 0 || resolved > precision) {
    reportDiagnostic(context.program, {
      code: "invalid-decimal",
      messageId: "scale",
      format: { scale: String(resolved), precision: String(precision) },
      target: context.decoratorTarget,
    });
    return;
  }

  recordLogicalType(context, target, { name: "decimal", precision, scale: resolved });
}

/**
 * Reads the logical type declared on a scalar or a field.
 *
 * @param program - The program to read the state from
 * @param target - The scalar or field to read
 *
 * @returns The annotation, or undefined when the target carries none
 *
 * @public
 */
export function getAvroLogicalType(
  program: Program,
  target: Scalar | ModelProperty,
): AvroLogicalTypeAnnotation | undefined {
  return getLogicalTypeInternal(program, target);
}
