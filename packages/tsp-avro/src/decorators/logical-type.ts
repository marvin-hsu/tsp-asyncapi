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
  setLogicalTypeInternal(context.program, target, { name });
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
 *   it is never larger than the precision.
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

  setLogicalTypeInternal(context.program, target, {
    name: "decimal",
    precision,
    scale: resolved,
  });
}

/**
 * Reads the logical type declared on a scalar or a field.
 *
 * @param program - The program to read the state from
 * @param target - The scalar or field to read
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
