import { Program } from "@typespec/compiler";
import { SecuritySchemeObject } from "../../src/types/index.js";
import { resolveSecuritySchemes } from "../../src/resolve/security-schemes.js";
import { lowerSecuritySchemes } from "../../src/lower/security-schemes.js";

/**
 * Builds `components.securitySchemes` the way the document builder does.
 *
 * The two halves are separate stages now, and every caller wants the whole
 * answer, so the pair has one name here rather than at each call site.
 *
 * @param program - The compiled program
 * @returns The map, or `undefined` when the program declares no scheme
 */
export function builtSecuritySchemes(
  program: Program,
): Record<string, SecuritySchemeObject> | undefined {
  return lowerSecuritySchemes(resolveSecuritySchemes(program));
}
