import { Program } from "@typespec/compiler";
import {
  UseSecurityTarget,
  listUsedSecuritySchemes,
} from "../decorators/security/use-security-state.js";
import { reportDiagnostic } from "../lib.js";
import { ReferenceObject } from "../types.js";
import { securitySchemeRef } from "./json-pointer.js";

/**
 * Builds the `security` array of one server or one operation.
 *
 * AsyncAPI gives both objects the same field with the same shape. So the
 * three decisions this array needs are made once, here. The first decision
 * is the form of an entry. Each one is a reference into
 * `components.securitySchemes`. AsyncAPI allows an inline scheme as well,
 * and this emitter never writes one, so both objects point at the shared
 * definition.
 *
 * The second decision is what happens to a name that no `@securityScheme`
 * defines. It is reported and dropped. The reference would address a key
 * that the document does not carry, and an AsyncAPI parser rejects the whole
 * document for it. `@useSecurity` cannot make this check itself, because a
 * `@securityScheme` anywhere in the program can still arrive after it runs.
 * Here the full set is known.
 *
 * The third decision is what an empty result means. The caller omits the
 * field, because AsyncAPI reads an empty array as "this object needs no
 * scheme at all".
 *
 * The two arrays are read together and never merged. A client satisfies the
 * array of the server and the array of the operation. So an operation never
 * copies the list of its server in. Copying it would state something else
 * the moment that list changes.
 *
 * @param program - The program to read the applications from
 * @param target - The namespace or operation that carries the `@useSecurity`
 * @param declaredSchemes - The keys of `components.securitySchemes`
 * @returns The `security` array, or `undefined` when no entry survives
 */
export function buildSecurityRequirements(
  program: Program,
  target: UseSecurityTarget,
  declaredSchemes: ReadonlySet<string>,
): ReferenceObject[] | undefined {
  const references: ReferenceObject[] = [];
  for (const { schemeName, target: applicationTarget } of listUsedSecuritySchemes(
    program,
    target,
  )) {
    if (!declaredSchemes.has(schemeName)) {
      reportDiagnostic(program, {
        code: "undeclared-security-scheme",
        format: { schemeName },
        target: applicationTarget,
      });
      continue;
    }
    references.push({ $ref: securitySchemeRef(schemeName) });
  }
  return references.length > 0 ? references : undefined;
}
