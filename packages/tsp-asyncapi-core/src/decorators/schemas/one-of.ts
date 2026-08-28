import { DecoratorContext, Program, Union } from "@typespec/compiler";
import { useStateSet } from "@typespec/compiler/utils";

const oneOfStateKey = Symbol.for("tsp-asyncapi.oneOf");

const [isOneOfInternal, markOneOf] = useStateSet<Union>(oneOfStateKey);

/**
 * Marks a union to emit `oneOf` instead of the default `anyOf` for its
 * variants.
 * This is a plain marker, a union either is or isn't in the set, matching
 * `@typespec/json-schema`'s own `$oneOf` decorator shape. It carries no
 * value of its own to look up.
 *
 * @example
 * ```typespec
 * @oneOf
 * union Shape { Circle, Square }
 * ```
 *
 * @public
 */
export function $oneOf(context: DecoratorContext, target: Union) {
  markOneOf(context.program, target);
}

/**
 * Tells whether `@oneOf` marks this union.
 *
 * @returns True when the decorator was applied to `target`
 *
 * @public
 */
export function isOneOf(program: Program, target: Union): boolean {
  return isOneOfInternal(program, target);
}
