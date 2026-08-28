import { Program } from "@typespec/compiler";
import { SecuritySchemeObject } from "#emitter/types/index.js";
import { resolveSecuritySchemes } from "#core/resolve/security-schemes.js";
import { lowerSecuritySchemes } from "#emitter/lower/security-schemes.js";

/**
 * Builds `components.securitySchemes` the way the document builder does.
 * The resolve and lower stages are separate, so this combines them under
 * one name instead of repeating the pair at each call site.
 *
 * @param program - The compiled program
 * @returns The map, or `undefined` when the program declares no scheme
 */
export function builtSecuritySchemes(
  program: Program,
): Record<string, SecuritySchemeObject> | undefined {
  return lowerSecuritySchemes(resolveSecuritySchemes(program));
}
