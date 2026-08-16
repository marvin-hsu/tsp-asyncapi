import { Diagnostic, getSourceLocation } from "@typespec/compiler";

/**
 * Finds the one diagnostic a test is about.
 *
 * The test fails with the code it looked for when nothing reported it. A
 * `find` alone returns `undefined`, and the failure then names a property of
 * `undefined` instead of the missing diagnostic.
 *
 * @param diagnostics - Every diagnostic the compile reported
 * @param code - The full code, such as `tsp-asyncapi/empty-channel-id`
 * @returns The first diagnostic with that code
 */

/**
 * Reads the source text one diagnostic points at.
 *
 * A diagnostic carries a code and a message, and it also carries the place
 * the author has to look. The place is the part a test cannot see in the
 * code alone. Two decorator arguments sit next to each other, so an
 * off-by-one in the argument index still produces the right code with the
 * squiggle on the wrong argument.
 *
 * The text of a string argument holds its quotes, because the node the
 * compiler points at is the whole string literal.
 *
 * @param diagnostic - The reported diagnostic
 * @returns The source text of its target, or an empty string when it has no
 * target. An empty string never matches text a test asks for.
 */
export function findDiagnostic(diagnostics: readonly Diagnostic[], code: string): Diagnostic {
  const found = diagnostics.find((diagnostic) => diagnostic.code === code);
  if (found === undefined) {
    throw new Error(`No diagnostic with the code '${code}' was reported.`);
  }
  return found;
}

export function targetText(diagnostic: Diagnostic): string {
  const location = getSourceLocation(diagnostic.target);
  if (location === undefined) return "";
  return location.file.text.slice(location.pos, location.end);
}
