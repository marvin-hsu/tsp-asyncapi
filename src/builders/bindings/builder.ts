/**
 * The bindings seam the builders that are not split yet still call.
 *
 * The bindings themselves are already split: `resolve/bindings.ts` decides
 * which applications reach one object, and `lower/bindings.ts` renders
 * them. The message, channel, and operation builders still do both halves in
 * one pass, so they call this instead of the two directly.
 *
 * It goes away as each of those builders is split.
 */

import { Program, Type } from "@typespec/compiler";
import { EmittedBindingLevel } from "../../decorators/bindings/state.js";
import { lowerBindings } from "../../lower/bindings.js";
import { BindingPlacements, resolveBindings } from "../../resolve/bindings.js";
import { BindingsObject } from "../../types.js";

/**
 * Resolves and renders the bindings of one object in a single call.
 *
 * @param program - The program to read the bindings from
 * @param level - The document position being built
 * @param target - The type that carries the decorators
 * @param placements - Where the applications this build placed are recorded
 * @returns The `bindings` object, or `undefined` when the target carries none
 * @internal
 */
export function buildBindings(
  program: Program,
  level: EmittedBindingLevel,
  target: Type,
  placements: BindingPlacements,
): BindingsObject | undefined {
  return lowerBindings(resolveBindings(program, level, target, placements));
}
