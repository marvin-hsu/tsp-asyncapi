/**
 * The `@fixed` decorator and its reader, `getAvroFixedSize`.
 *
 * This file only checks that the width is a positive number and records it.
 * It does not decide what schema shape a fixed type takes. It does not check
 * the width against any logical type placed on the same declaration either.
 * The walk makes both calls when it renders the type.
 */

import { DecoratorContext, Model, Program, Scalar } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";

const fixedStateKey = Symbol.for("tsp-avro.fixed");

const [getFixedInternal, setFixedInternal] = useStateMap<Model | Scalar, number>(fixedStateKey);

/**
 * Declares a fixed number of bytes.
 *
 * An Avro fixed type is a named type that holds exactly that many bytes. It is
 * how a hash, a currency amount or a duration is carried, because the reader
 * knows the width before it reads.
 *
 * A fixed type holds bytes and nothing else, so a model marked here declares
 * no field.
 *
 * @param context - The decorator context
 * @param target - The model or scalar that becomes the fixed type
 * @param size - How many bytes, which is a positive number
 *
 * @example
 * ```typespec
 * @fixed(16)
 * scalar Md5 extends bytes;
 * ```
 *
 * @public
 */
export function $fixed(context: DecoratorContext, target: Model | Scalar, size: number): void {
  // The declaration takes an `int32`, so the compiler has already refused
  // anything that is not a whole number. What is left to refuse is a width no
  // type can have.
  if (size <= 0) {
    reportDiagnostic(context.program, {
      code: "invalid-fixed",
      messageId: "default",
      format: { size: String(size) },
      target: context.decoratorTarget,
    });
    return;
  }
  setFixedInternal(context.program, target, size);
}

/**
 * Reads the byte width declared on a model or a scalar.
 *
 * @param program - The program to read the state from
 * @param target - The model or scalar to read
 * @returns The width, or undefined when the declaration is not a fixed type
 *
 * @public
 */
export function getAvroFixedSize(program: Program, target: Model | Scalar): number | undefined {
  return getFixedInternal(program, target);
}
