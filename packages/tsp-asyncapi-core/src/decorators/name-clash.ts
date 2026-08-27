import { DiagnosticTarget, Program } from "@typespec/compiler";
import { reportDiagnostic } from "../lib.js";
import { SourcePosition, bySourcePosition, isSameApplication } from "../source-order.js";

/**
 * The diagnostic reported for the application that loses a name clash.
 * Both codes take the claimed name and nothing else.
 */
type NameClashCode = "duplicate-server-name" | "duplicate-security-scheme-name";

/**
 * One recorded application that claims a name.
 *
 * The position is what ranks two applications against each other. The
 * diagnostic target is where the message about the losing one is reported,
 * which is the name argument rather than the whole declaration.
 */
export interface NamedApplication extends SourcePosition {
  /** Where to report a problem about the name of this application. */
  nameTarget: DiagnosticTarget;
}

/**
 * Settles two applications that claim one name.
 *
 * `@server` and `@securityScheme` both write their name argument as a key of
 * a map. Two applications cannot share one key, so one of them is dropped.
 * Both decorators had the same fifteen lines for it, and a change to the
 * rule had to be made twice.
 *
 * Source position decides the winner, not evaluation order. The application
 * written first in the file is kept, and the other one is reported and
 * dropped. Evaluation order would make the winner depend on whether the
 * author wrote the decorator inline or as an augment decorator.
 *
 * The same statement can run more than once. An augment decorator runs once
 * per declaration of its target namespace, so one statement runs again for
 * every reopened `namespace` block and for every file that opens the
 * namespace. Those runs are one application, not a clash, and they are
 * recognised by their shared position. Two distinct statements can never
 * share a file and an offset, so a real duplicate is still reported.
 *
 * The winner is written into `records` in place, at the index the loser
 * held. That keeps the list in the order the names were first claimed.
 *
 * @param program - The program the applications belong to
 * @param records - The recorded applications, which this may change
 * @param clashIndex - Where in `records` the earlier claim to the name sits
 * @param record - The application that is running now
 * @param code - The diagnostic reported for the dropped application
 * @param name - The name both applications claim
 * @internal
 */
export function settleNameClash<T extends NamedApplication>(
  program: Program,
  records: T[],
  clashIndex: number,
  record: T,
  code: NameClashCode,
  name: string,
): void {
  const existing = records[clashIndex];
  if (isSameApplication(existing, record)) return;
  const dropped = bySourcePosition(program)(record, existing) < 0 ? existing : record;
  if (dropped === existing) records[clashIndex] = record;
  reportDiagnostic(program, { code, format: { name }, target: dropped.nameTarget });
}
