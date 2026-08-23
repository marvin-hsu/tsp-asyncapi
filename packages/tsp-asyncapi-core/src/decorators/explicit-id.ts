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
 * The result has three values, and each one asks the caller for something
 * different. A string is the trimmed id, and the caller records it. The value
 * `undefined` means the author gave no id at all, and the caller falls back
 * to the declaration name. The value `null` means the author gave a blank id,
 * and the caller drops the whole declaration.
 *
 * A blank key names nothing. Emitting the declaration under an empty key
 * would put it in the document at an address no reference can reach. So the
 * declaration goes instead, and the author hears why.
 *
 * Only whitespace is rejected. No key charset is enforced here. The AsyncAPI
 * JSON Schema puts no pattern on a key of the Channels Object, and none on a
 * key of the Operations Object either.
 *
 * @param context - The decorator context
 * @param id - The id argument, as the author wrote it
 * @param idTarget - Where to report a blank id. It is the argument node, so
 * the author is pointed at the text they wrote.
 * @param code - The diagnostic this decorator reports for a blank id
 * @returns The trimmed id, `undefined` when the author gave none, or `null`
 * when the id was blank and the caller must drop the declaration
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
