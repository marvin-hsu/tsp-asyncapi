import { DecoratorContext, Program, Type } from "@typespec/compiler";
import { useStateSet } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";

/**
 * The diagnostic a decorator reports when it is applied twice.
 *
 * This module owns the concept, so every caller that passes such a code names
 * this type. A caller with a copy of the declaration would keep compiling
 * after this one narrows, because the two remain assignable.
 */
export type DuplicateCode = Parameters<typeof reportDiagnostic>[1]["code"];

/** The guard one decorator uses to keep itself to a single application. */
export interface ApplicationGuard {
  /**
   * Records that the decorator ran on a target, and tells the caller whether
   * it may proceed. A second application is reported and rejected.
   */
  claim(context: DecoratorContext, target: Type): boolean;
  /**
   * Answers whether this decorator already ran on a target.
   *
   * A decorator that only guards itself never needs this. A decorator whose
   * mistake spans two decorators does. `@send` and `@receive` state opposite
   * directions, so each one has to see whether the other reached the same
   * operation.
   */
  isApplied(program: Program, target: Type): boolean;
}

/**
 * Builds the guard a decorator uses to reject a second application.
 *
 * A decorator that carries one value can only keep one of them, so a second
 * application is reported rather than allowed to overwrite in silence.
 *
 * The guard records that the decorator ran, and never reads the value it
 * stored. Those are different questions, and answering the first with the
 * second leaves a hole: an application whose value fails validation stores
 * nothing, so the next application looks like the first one and is accepted
 * without a word. The author is told their value was invalid, and never
 * told they wrote the decorator twice. Every decorator here made that
 * mistake, and one of them was fixed on its own before this was written.
 *
 * Decorators on one declaration run bottom-up, so the application written
 * last in the source runs first and wins. That is stated in each caller's
 * documentation, and holding the winner steady is why the guard has to run
 * before any validation.
 *
 * @param stateKey - A symbol private to the calling decorator
 * @param code - The diagnostic reported for the second application
 * @returns The guard for that decorator
 */
export function singleApplication(stateKey: symbol, code: DuplicateCode): ApplicationGuard {
  const [isApplied, markApplied] = useStateSet<Type>(stateKey);

  return {
    claim(context: DecoratorContext, target: Type): boolean {
      if (isApplied(context.program, target)) {
        reportDiagnostic(context.program, { code, target });
        return false;
      }
      markApplied(context.program, target);
      return true;
    },
    isApplied(program: Program, target: Type): boolean {
      return isApplied(program, target);
    },
  };
}
