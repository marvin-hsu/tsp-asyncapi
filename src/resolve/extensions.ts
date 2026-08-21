/**
 * The resolve half of the `x-` specification extensions.
 *
 * It reads the `@extension` state of one target, applies source order, and
 * hands the winners to the node the target produces. A target that produces
 * more than one object, such as a namespace that is both the service and a
 * channel, hands the same set to each of them.
 *
 * Every report lives in the wrap-up pass at the bottom of this file, which
 * walks each target once. Reporting beside the winner picking would repeat
 * the same clash once per object the target produces.
 */

import { Program, Type } from "@typespec/compiler";
import {
  ExtensionEntry,
  listExtensionEntries,
  listExtensionTargets,
} from "../decorators/extension.js";
import { reportDiagnostic } from "../lib.js";
import { bySourcePosition, isSameApplication, sourcePositionOf } from "../source-order.js";

/**
 * Picks the surviving pair of every key one target carries.
 *
 * The later application of a repeated key loses, the same rule every other
 * key collision in this emitter follows. An augment decorator on a reopened
 * namespace runs its one statement once per declaration, so an entry at the
 * winner's own position is the same application seen again, not a clash.
 *
 * This is the one owner of that decision. The resolver takes the winners,
 * and the wrap-up pass takes the losers to report.
 */
function pickExtensions(
  program: Program,
  target: Type,
): { extensions: Record<string, unknown>; clashes: ExtensionEntry[] } {
  const entries = [...listExtensionEntries(program, target)];
  const compare = bySourcePosition(program);
  entries.sort((a, b) => compare(a.position, b.position));

  const extensions: Record<string, unknown> = {};
  const clashes: ExtensionEntry[] = [];
  const winners = new Map<string, ExtensionEntry>();
  for (const entry of entries) {
    const winner = winners.get(entry.key);
    if (winner === undefined) {
      winners.set(entry.key, entry);
      extensions[entry.key] = entry.value;
      continue;
    }
    if (isSameApplication(winner.position, entry.position)) continue;
    clashes.push(entry);
  }
  return { extensions, clashes };
}

/**
 * Resolves the extensions of one target into the record its node carries.
 *
 * The keys all match the specification extension shape, so a plain object is
 * safe: no key can be `__proto__`.
 *
 * @param program - The program the target belongs to
 * @param target - The type whose emitted object carries the extensions
 * @returns The surviving pairs, in source order. Empty when the decorator
 * was never applied.
 * @internal
 */
export function resolveExtensions(
  program: Program,
  target: Type,
): Readonly<Record<string, unknown>> {
  return pickExtensions(program, target).extensions;
}

/**
 * Reports every `@extension` mistake, one target at a time.
 *
 * Two mistakes reach an author here. A target that emits no object carries
 * extensions that reach no part of the document: only `info`, a channel, an
 * operation, and a message carry them. Dropping those in silence hides an
 * author mistake, the same reasoning `use-server-without-channel` follows.
 * A repeated key on a target that does emit is the other.
 *
 * A misplaced target gets one report, however many entries it carries. The
 * mistake is the placement, not each key. Its repeated keys stay unreported,
 * because none of its keys reached an object either way.
 *
 * The reports come out in source order. The state layer hands the targets
 * over in the order the decorators ran, which is not the order the author
 * reads.
 *
 * @param program - The program to read the state from
 * @param emittedTargets - Every type whose extensions reached an object
 * @internal
 */
export function reportExtensionProblems(program: Program, emittedTargets: ReadonlySet<Type>): void {
  for (const [target, entries] of targetsInSourceOrder(program)) {
    if (entries.length === 0) continue;
    if (!emittedTargets.has(target)) {
      reportDiagnostic(program, { code: "extension-target-not-emitted", target });
      continue;
    }
    for (const clash of pickExtensions(program, target).clashes) {
      reportDiagnostic(program, {
        code: "duplicate-extension-key",
        format: { key: clash.key },
        target: clash.keyTarget,
      });
    }
  }
}

/**
 * Ranks every target that carries entries by where it was declared.
 *
 * The rank is the declaration of the target, not the position of any one
 * application. A misplaced target gets one report, and that report points at
 * the declaration.
 */
function targetsInSourceOrder(program: Program): [Type, readonly ExtensionEntry[]][] {
  const compare = bySourcePosition(program);
  return listExtensionTargets(program)
    .map(([target, entries]) => ({ target, entries, key: sourcePositionOf(target) }))
    .sort((a, b) => compare(a.key, b.key))
    .map(({ target, entries }) => [target, entries]);
}
