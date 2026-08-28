import { expect } from "vitest";
import { Diagnostic, getSourceLocation } from "@typespec/compiler";
import { $lib } from "#core/lib.js";

/**
 * The code of one diagnostic this library defines, without the library prefix.
 *
 * The union comes from `$lib`, so a code that is not defined is a compile
 * error rather than a test that looks for something nothing can report.
 * `createTypeSpecLibrary` declares its diagnostics parameter as `const`, which
 * is what keeps the keys as literals here.
 *
 * The code stays spelled out at the call site on purpose. It is the part of a
 * diagnostic that other people's code depends on, so a test naming it is
 * pinning a public contract. Deriving the code from `$lib` as well would leave
 * the assertion comparing the library against itself.
 */
export type DiagnosticCode = keyof typeof $lib.diagnostics;

/**
 * Finds the one diagnostic a test is about.
 *
 * The test fails with the code it looked for when nothing reported it. A
 * `find` alone returns `undefined`, and the failure then names a property of
 * `undefined` instead of the missing diagnostic.
 *
 * @param diagnostics - Every diagnostic the compile reported
 * @param code - The code without the prefix, such as `empty-channel-id`
 * @returns The first diagnostic with that code
 */
export function findDiagnostic(
  diagnostics: readonly Diagnostic[],
  code: DiagnosticCode,
): Diagnostic {
  const full = `${$lib.name}/${code}`;
  const found = diagnostics.find((diagnostic) => diagnostic.code === full);
  if (found === undefined) {
    throw new Error(`No diagnostic with the code '${full}' was reported.`);
  }
  return found;
}

/**
 * Every diagnostic with one code, in the order they were reported.
 *
 * The counterpart to `findDiagnostic`, for a test about how many times
 * something was reported rather than about one report. A hand-written
 * `filter` on `diagnostic.code` has to spell the prefix, and spelling it is
 * the part that goes wrong when the package is renamed.
 *
 * @param diagnostics - Every diagnostic the compile reported
 * @param code - The code without the prefix, such as `duplicate-binding`
 * @returns The diagnostics with that code, which may be none
 */
export function diagnosticsWith(
  diagnostics: readonly Diagnostic[],
  code: DiagnosticCode,
): Diagnostic[] {
  const full = `${$lib.name}/${code}`;
  return diagnostics.filter((diagnostic) => diagnostic.code === full);
}

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
 * @param diagnostic - The diagnostic to read the target of
 * @returns The source text of its target, or an empty string when it has no
 * target. An empty string never matches text a test asks for.
 */
export function targetText(diagnostic: Diagnostic): string {
  const location = getSourceLocation(diagnostic.target);
  if (location === undefined) return "";
  return location.file.text.slice(location.pos, location.end);
}

/**
 * Whether anything the compile reported was an error.
 *
 * A property that only claims something about a document the emitter did
 * write has to skip the draws it refused, and this is the question that
 * decides. It was written out inline at ten sites.
 *
 * @param diagnostics - Every diagnostic the compile reported
 * @returns Whether any of them is an error
 */
export function hasError(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

/**
 * Asserts that a compile meant to succeed reported no error.
 *
 * The messages are compared rather than the diagnostics, so a failure says
 * what went wrong instead of printing the whole diagnostic objects, targets
 * and all. Warnings are left alone: a case that means to allow none of those
 * either calls `expectDiagnosticEmpty` instead.
 *
 * @param diagnostics - Every diagnostic the compile reported
 */
export function expectNoErrors(diagnostics: readonly Diagnostic[]): void {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  expect(errors.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)).toEqual([]);
}
