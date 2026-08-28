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
 * `@server` and `@securityScheme` both write their name argument as a map
 * key, so a clash needs the same rule in both places.
 *
 * Source position decides the winner, not evaluation order, so the winner
 * does not depend on whether the author wrote the decorator inline or as an
 * augment decorator. An augment decorator runs once per reopened `namespace`
 * block, so the same statement can run more than once. Those runs share one
 * source position and count as one application, not a clash. Two distinct
 * statements never share a source position, so a genuine duplicate is still
 * reported.
 *
 * The winner replaces the loser in `records`, in place, so the list keeps
 * the order names were first claimed.
 *
 * @param program - The program the applications belong to
 * @param records - The recorded applications, which this may change
 * @param clashIndex - Where in `records` the earlier claim to the name sits
 * @param record - The application that is running now
 * @param code - The diagnostic reported for the dropped application
 * @param name - The name both applications claim
 *
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
