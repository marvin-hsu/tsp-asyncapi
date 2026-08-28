/**
 * The explicit key argument several decorators take.
 *
 * `@channel`, `@dynamicChannel`, `@send` and `@receive` all accept an
 * optional id. The id becomes the key of that declaration in the emitted
 * document. All four make the same decision about it, so the decision is
 * written once here rather than once per decorator folder.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { reportDiagnostic } from "../lib.js";

/** The diagnostic a decorator reports when its explicit id is blank. */
type EmptyIdCode = Parameters<typeof reportDiagnostic>[1]["code"];

/**
 * Reads the explicit id argument of a decorator, and reports a blank one.
 *
 * The result carries three distinct meanings. A string is the trimmed id, to
 * record. `undefined` means the author gave no id, so the caller falls back
 * to the declaration name. `null` means the author gave a blank id, so the
 * caller drops the whole declaration: a blank key names nothing, and
 * emitting the declaration under it would put it at an address no reference
 * can reach.
 *
 * Only whitespace is rejected here. No key charset is enforced, because the
 * AsyncAPI JSON Schema puts no pattern on a key of the Channels Object or the
 * Operations Object.
 *
 * @param idTarget - Where to report a blank id, so the author is pointed at
 * the text they wrote
 * @param code - The diagnostic this decorator reports for a blank id
 */
export function resolveExplicitId(
  context: DecoratorContext,
  id: string | undefined,
  idTarget: DiagnosticTarget,
  code: EmptyIdCode,
): string | undefined | null {
  if (id === undefined) return undefined;
  const trimmed = id.trim();
  if (trimmed === "") {
    reportDiagnostic(context.program, { code, target: idTarget });
    return null;
  }
  return trimmed;
}
