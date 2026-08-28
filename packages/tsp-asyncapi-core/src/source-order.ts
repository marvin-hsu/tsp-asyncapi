/**
 * Recovering source order.
 *
 * Two parts of this library need it. Several decorators are repeatable, and
 * each one emits an ordered array. The compiler records the applications in
 * the order they ran, and that order is not source order. Other collections,
 * such as the channels of a program and the operations of an interface,
 * arrive in a map whose order is not source order either.
 *
 * Both parts rank by the same key, so the key is defined once here. This
 * module sits above `decorators/` and `builders/`, because both use it.
 */

import { DiagnosticTarget, Program, getSourceLocation } from "@typespec/compiler";
import { Node } from "@typespec/compiler/ast";

/**
 * Where one declaration or one decorator application was written.
 *
 * The position is recorded when the declaration is, and it is compared later.
 * Evaluation order is not used, because it differs between a decorator
 * written inline and an augment decorator.
 */
export interface SourcePosition {
  /** The path of the file that holds it. */
  file: string;
  /** The offset inside that file. */
  pos: number;
}

/**
 * Reads the source position of one thing the compiler can point at.
 *
 * @param target - The declaration, or the `decoratorTarget` of a running
 * decorator application
 * @returns The file and offset it was written at
 * @internal
 */
export function sourcePositionOf(target: DiagnosticTarget): SourcePosition {
  const location = getSourceLocation(target);
  return { file: location.file.path, pos: location.pos };
}

/**
 * Ranks the source files of a program.
 *
 * `program.sourceFiles` is a `Map` whose insertion order matches the order
 * files were reached while compiling: `main.tsp` first, then each `import`
 * the first time it is reached. So the index of a path in that map is a
 * stable, execution-order-consistent file ranking. A path the map does not
 * hold ranks before every other file, which keeps the sort total.
 *
 * @param program - The program to read the state from
 */
function fileRanking(program: Program): (path: string) => number {
  const order = new Map<string, number>();
  for (const path of program.sourceFiles.keys()) {
    order.set(path, order.size);
  }
  return (path) => order.get(path) ?? -1;
}

/**
 * Builds the comparator that puts source positions in source order.
 *
 * A `pos` is only a byte offset inside its own source file. Comparing `pos`
 * across two files compares unrelated numbers. So the comparator ranks by
 * file first, and `pos` breaks the tie inside one file.
 *
 * The file ranking comes from `program.sourceFiles` rather than from the
 * path text. A lexicographic path order would depend on where the project
 * sits on disk, and it would put an imported file before `main.tsp` as often
 * as after it.
 *
 * The ranking is read once per comparator, so build the comparator once and
 * hand it to `sort`.
 *
 * @param program - The program the positions belong to
 * @returns A comparator over source positions
 * @internal
 */
export function bySourcePosition(
  program: Program,
): (a: SourcePosition, b: SourcePosition) => number {
  const rank = fileRanking(program);
  return (a, b) => rank(a.file) - rank(b.file) || a.pos - b.pos;
}

/**
 * Recovers source order for a repeatable decorator's recorded state.
 *
 * `nodes` holds the source node of each application, in the same order as
 * `recorded`, one node per entry. The caller supplies it, because how an
 * entry maps back to its application differs per decorator.
 *
 * Inline decorators execute bottom-up: the last-listed one executes first.
 * Augment decorators are spliced in *before* the inline ones by the checker
 * (see `checkDecorators` in `@typespec/compiler`'s `checker.js`). A blanket
 * reverse would work for inline-only applications, but it inverts augment
 * applications instead. Sorting by source position recovers true source
 * order for any mix of the two.
 *
 * The sort key is the source position, and `bySourcePosition` above defines
 * how two of them compare.
 *
 * The result falls back to a plain reverse when the nodes and the recorded
 * list do not pair up. That should not happen, because every application has
 * a source node. Falling back keeps the best-effort order rather than
 * throwing out of the emitter.
 *
 * @param program - The program to read the state from
 * @param nodes - The source nodes to sort
 * @param recorded - The recorded positions, keyed the same way as `nodes`
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
  const keys: SourcePosition[] = [];
  for (const node of nodes) {
    if (node === undefined) {
      return [...recorded].reverse();
    }
    keys.push(sourcePositionOf(node));
  }
  const compare = bySourcePosition(program);
  return recorded
    .map((entry, index) => ({ entry, key: keys[index] }))
    .sort((a, b) => compare(a.key, b.key))
    .map((sorted) => sorted.entry);
}

/**
 * True when two recorded applications are the same one, run twice.
 *
 * An augment decorator runs once per declaration of its target. A namespace
 * that is reopened therefore runs the same statement again, and the second
 * run must not be mistaken for a second application. Two statements written
 * in different places can never share a file and an offset, so the position
 * is the identity.
 *
 * @param a - The first recorded position
 * @param b - The second recorded position
 * @returns Whether both were written at the same place in the same file
 * @internal
 */
export function isSameApplication(a: SourcePosition, b: SourcePosition): boolean {
  return a.file === b.file && a.pos === b.pos;
}
