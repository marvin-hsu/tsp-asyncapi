/**
 * The `@enumDefault` decorator and its reader, `getAvroEnumDefault`.
 *
 * This file only checks that the named member exists on the enum and
 * records it. It does not decide whether a given schema needs a default
 * symbol at all. The walk makes that call when it renders the enum.
 */

import { DecoratorContext, Enum, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";

const enumDefaultStateKey = Symbol.for("tsp-avro.enumDefault");

const [getEnumDefaultInternal, setEnumDefaultInternal] = useStateMap<Enum, string>(
  enumDefaultStateKey,
);

/**
 * Declares the symbol a reader falls back to.
 *
 * An Avro reader that meets a symbol its own schema does not hold reads this
 * one instead. Without it, that reader fails. So this is what lets a writer
 * add a symbol without breaking every reader that has not been updated.
 *
 * @param context - The decorator context
 * @param target - The enum the symbol belongs to
 * @param member - The name of a member this enum declares
 *
 * @example
 * ```typespec
 * @enumDefault("UNKNOWN")
 * enum Channel { UNKNOWN, WEB, MOBILE }
 * ```
 *
 * @public
 */
export function $enumDefault(context: DecoratorContext, target: Enum, member: string): void {
  // The members are built before the decorators of the enum run, so the enum
  // can answer this here, where the author wrote the name.
  if (!target.members.has(member)) {
    reportDiagnostic(context.program, {
      code: "enum-default",
      format: { name: member, enum: target.name },
      target: context.decoratorTarget,
    });
    return;
  }
  setEnumDefaultInternal(context.program, target, member);
}

/**
 * Reads the fallback symbol declared on an enum.
 *
 * @param program - The program to read the state from
 * @param target - The enum to read
 * @returns The symbol, or undefined when the enum declares none
 *
 * @public
 */
export function getAvroEnumDefault(program: Program, target: Enum): string | undefined {
  return getEnumDefaultInternal(program, target);
}
