import { DecoratorContext, Model } from "@typespec/compiler";
import { useStateSet } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";

/**
 * The diagnostic a decorator reports when it is applied twice.
 */
type DuplicateCode = Parameters<typeof reportDiagnostic>[1]["code"];

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
 * @returns A function that returns true when the caller may proceed
 */
export function singleApplication(
  stateKey: symbol,
  code: DuplicateCode,
): (context: DecoratorContext, target: Model) => boolean {
  const [isApplied, markApplied] = useStateSet<Model>(stateKey);

  return function claim(context: DecoratorContext, target: Model): boolean {
    if (isApplied(context.program, target)) {
      reportDiagnostic(context.program, { code, target });
      return false;
    }
    markApplied(context.program, target);
    return true;
  };
}
