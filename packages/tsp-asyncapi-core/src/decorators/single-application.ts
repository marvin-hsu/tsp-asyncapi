import { DecoratorContext, Program, Type } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";
import { SourcePosition, isSameApplication, sourcePositionOf } from "../source-order.js";

/**
 * The diagnostic a decorator reports when it is applied twice.
 *
 * This module owns the concept, so every caller that passes such a code names
 * this type. A caller with a copy of the declaration would keep compiling
 * after this one narrows, because the two remain assignable.
 */
export type DuplicateCode = Parameters<typeof reportDiagnostic>[1]["code"];

/**
 * What one call to `claim` found.
 *
 * `first` is the one result that lets the caller run its body. The other two
 * both stop it, and they are kept apart because only one of them is a
 * mistake. `repeat` is the same statement running again, and nothing is
 * reported for it. `rejected` is a second statement, and it is reported.
 */
export type ClaimResult = "first" | "repeat" | "rejected";

/** The guard one decorator uses to keep itself to a single application. */
export interface ApplicationGuard {
  /**
   * Records where the decorator ran on a target, and tells the caller what
   * it found. The caller runs its body only for `first`. A second
   * application is reported and answered with `rejected`. A repeat run of
   * the one statement already recorded is answered with `repeat`.
   */
  claim(context: DecoratorContext, target: Type): ClaimResult;
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
  const [claimedAt, recordClaim] = useStateMap<Type, SourcePosition>(stateKey);

  return {
    claim(context: DecoratorContext, target: Type): ClaimResult {
      const position = sourcePositionOf(context.decoratorTarget);
      const claimed = claimedAt(context.program, target);
      if (claimed !== undefined) {
        // The same statement can run more than once. An augment decorator
        // runs once per declaration of its target, so one statement runs
        // again for every reopened `namespace` block and for every file that
        // opens the namespace. Those runs are one application, so the repeat
        // is not reported. It is still told apart from the first run. The
        // first run already stored the value and already reported whatever
        // was wrong with it, and a caller that ran its body again would
        // report each of those problems once per declaration. Two distinct
        // statements can never share a file and an offset, so a real
        // duplicate is still reported.
        if (isSameApplication(claimed, position)) return "repeat";
        reportDiagnostic(context.program, { code, target });
        return "rejected";
      }
      recordClaim(context.program, target, position);
      return "first";
    },
    isApplied(program: Program, target: Type): boolean {
      return claimedAt(program, target) !== undefined;
    },
  };
}
