/**
 * Recovering source order for a repeatable decorator.
 *
 * Several decorators in this library are repeatable, and each one emits an
 * ordered array. The compiler records the applications in the order they
 * ran, and that order is not source order. This module turns one back into
 * the other.
 */

import { Program, getSourceLocation } from "@typespec/compiler";
import { Node } from "@typespec/compiler/ast";

/**
 * Recovers source order for a repeatable decorator's recorded state.
 *
 * `nodes` holds the source node of each application, in the same order as
 * `recorded`, one node per entry. The caller supplies it, because how an
 * entry maps back to its application differs per decorator.
 *
 * The recorded list is in the order the applications *ran*, which is not the
 * order they appear in source.
 * Inline decorators execute bottom-up: the last-listed one executes first.
 * Augment decorators are spliced in *before* the inline ones by the checker
 * (see `checkDecorators` in `@typespec/compiler`'s `checker.js`).
 * So a blanket reverse would be correct for inline-only applications, but it
 * inverts the relative order of augment applications instead. Sorting by
 * each application's source position recovers true source order. This works
 * for inline decorators, augment decorators, and any mix of the two.
 *
 * A decorator's `node.pos` is only a byte offset *within its own source
 * file*. Comparing `pos` across two different `.tsp` files compares
 * unrelated numbers. So when the applications are spread across files, the
 * sort key must rank by file first.
 * `program.sourceFiles` is a `Map` whose insertion order matches the order
 * files were reached while compiling: `main.tsp` first, then each `import`
 * the first time it is reached. Indexing into it gives a stable,
 * execution-order-consistent file ranking. `pos` remains the tie-break for
 * two applications in the same file.
 *
 * The result falls back to a plain reverse when the nodes and the recorded
 * list do not pair up. That should not happen, because every application has
 * a source node. Falling back keeps the best-effort order rather than
 * throwing out of the emitter.
 *
 * @internal
 */
export function orderBySourceNodes<T>(
  program: Program,
  nodes: readonly (Node | undefined)[],
  recorded: readonly T[],
): T[] {
  if (nodes.length !== recorded.length) {
    return [...recorded].reverse();
  }
  const fileOrder = new Map<string, number>();
  for (const path of program.sourceFiles.keys()) {
    fileOrder.set(path, fileOrder.size);
  }
  const keys: { fileIndex: number; pos: number }[] = [];
  for (const node of nodes) {
    if (node === undefined) {
      return [...recorded].reverse();
    }
    const location = getSourceLocation(node);
    keys.push({ fileIndex: fileOrder.get(location.file.path) ?? -1, pos: node.pos });
  }
  return recorded
    .map((entry, i) => ({ entry, ...keys[i] }))
    .sort((a, b) => a.fileIndex - b.fileIndex || a.pos - b.pos)
    .map((sorted) => sorted.entry);
}
