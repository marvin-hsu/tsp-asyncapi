/**
 * State recorded by `@extension`, and the readers other modules use.
 *
 * Every emitted object can carry `x-` specification extensions, so this
 * module is shared across `info`, channels, operations, and messages rather
 * than duplicated per decorator. It checks the key shape and the value's
 * serializability, but leaves clash resolution to resolve.
 */

import { DecoratorContext, DiagnosticTarget, Program, Type } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";
import { toPlainValue } from "../marshalled-values.js";
import { SourcePosition, bySourcePosition, sourcePositionOf } from "../source-order.js";

const extensionStateKey = Symbol.for("tsp-asyncapi.extension");

/**
 * The key shape the AsyncAPI Specification Extensions section allows.
 *
 * The specification writes it as `^x-[\w\d\.\-\_]+$`. `\w` already covers a
 * digit and an underscore, so the class below is the same set. The prefix
 * alone is not enough: the official parser rejects a bare `x-` and any key
 * with a character outside this set.
 */
const EXTENSION_KEY_PATTERN = /^x-[\w.-]+$/;

/**
 * One `x-` pair recorded by `@extension`.
 *
 * The entry keeps where it was written. Source order picks the winner of a
 * key clash, and that decision belongs to resolve, not to the run order of
 * the applications.
 *
 * @internal
 */
export interface ExtensionEntry {
  /** The `x-` prefixed member name. */
  readonly key: string;
  /** The value, already converted to plain JSON. */
  readonly value: unknown;
  /** Where this application was written. */
  readonly position: SourcePosition;
  /** The key argument, for a report about this application. */
  readonly keyTarget: DiagnosticTarget;
}

const [getEntriesInternal, setEntries, getExtensionStateMap] = useStateMap<Type, ExtensionEntry[]>(
  extensionStateKey,
);

/**
 * Adds one `x-` specification extension to whichever object the target
 * emits: `info`, a channel, an operation, or a message.
 *
 * This decorator is repeatable. Each application adds one key rather than
 * replacing a prior one. A repeated key is not reported here: which
 * application wins is a source-order question, and resolve owns source
 * order, the same split `duplicate-channel-id` uses.
 *
 * The key must match the shape the specification allows: `x-`, then one or
 * more letters, digits, underscores, dots, or hyphens. AsyncAPI reads no
 * other field as a specification extension, so an application with any other
 * key is reported and dropped.
 *
 * A value the serializer cannot represent is reported and dropped too. Every
 * other marshalled decorator argument in this emitter follows that rule.
 *
 * @param context - The decorator context
 * @param target - The type whose emitted object carries the extension
 * @param key - The `x-` prefixed member name
 * @param value - Any JSON value, emitted as written
 *
 * @example
 * ```typespec
 * @extension("x-internal-id", "orders-v2")
 * @message
 * model OrderCreated {
 *   id: string;
 * }
 * ```
 *
 * @public
 */
export function $extension(context: DecoratorContext, target: Type, key: string, value: unknown) {
  const keyTarget = context.getArgumentTarget(0) ?? target;
  if (!EXTENSION_KEY_PATTERN.test(key)) {
    reportDiagnostic(context.program, {
      code: "invalid-extension-key",
      format: { key },
      target: keyTarget,
    });
    return;
  }
  const plain = toPlainValue(context.program, value);
  if (plain === undefined) {
    // No JSON document holds an undefined member. Recording it would drop the
    // key while the writer runs, with nothing said about it.
    reportDiagnostic(context.program, {
      code: "unserializable-extension",
      format: { key },
      target: context.getArgumentTarget(1) ?? target,
    });
    return;
  }
  const entries = getEntriesInternal(context.program, target) ?? [];
  entries.push({
    key,
    value: plain,
    position: sourcePositionOf(context.decoratorTarget),
    keyTarget,
  });
  setEntries(context.program, target, entries);
}

/**
 * Reads back every entry that `@extension` records for one type.
 *
 * The list is in the order the applications ran, which is not source order.
 * Resolve sorts it, reports the key clashes, and keeps the winners.
 *
 * @param program - The program to read the state from
 * @param target - The type the decorator was applied to
 * @returns The recorded entries. The array is empty when the decorator was
 * never applied.
 * @internal
 */
export function listExtensionEntries(program: Program, target: Type): readonly ExtensionEntry[] {
  return getEntriesInternal(program, target) ?? [];
}

/**
 * Lists every type that carries at least one `@extension` entry.
 *
 * The unreached-target report needs the whole set, because a target that
 * emits no object is exactly one no resolver ever asks about.
 *
 * @param program - The program to read the state from
 * @returns Each target, with its recorded entries
 * @internal
 */
export function listExtensionTargets(program: Program): [Type, readonly ExtensionEntry[]][] {
  return [...getExtensionStateMap(program)];
}

/**
 * Reads back the extensions of one type, keyed by their `x-` name.
 *
 * The map follows source order, and the first application of a key wins.
 * That is the same answer the emitted document gives, so a tool built on
 * this reader sees what the document will hold. No clash is reported here;
 * the emitter does that once, while it resolves.
 *
 * The name follows the `getExtensions` reader of `@typespec/openapi`.
 *
 * @param program - The program to read the state from
 * @param target - The type the decorator was applied to
 * @returns The extensions, in source order. The map is empty when the
 * decorator was never applied.
 * @public
 */
export function getExtensions(program: Program, target: Type): ReadonlyMap<string, unknown> {
  const entries = [...(getEntriesInternal(program, target) ?? [])];
  const compare = bySourcePosition(program);
  entries.sort((a, b) => compare(a.position, b.position));
  const extensions = new Map<string, unknown>();
  for (const entry of entries) {
    if (extensions.has(entry.key)) continue;
    extensions.set(entry.key, entry.value);
  }
  return extensions;
}
