import { Program } from "@typespec/compiler";
import { SecuritySchemeObject } from "../types/index.js";
import { getSecuritySchemes } from "../decorators/security-scheme.js";

/**
 * Builds the `components.securitySchemes` map from the `@securityScheme`
 * decorators of the whole program.
 *
 * The decorator already checked each scheme. It reported a diagnostic and
 * dropped any scheme with a bad or repeated name, a blank required field, or
 * an unusable set of OAuth flows. So every record here is safe to use as a
 * key.
 *
 * @param program - The program to read the schemes from
 * @returns The `securitySchemes` map, or `undefined` when the program
 * declares no scheme. The caller then omits the field.
 */
export function buildSecuritySchemes(
  program: Program,
): Record<string, SecuritySchemeObject> | undefined {
  const declared = getSecuritySchemes(program);
  if (declared.length === 0) return undefined;

  // The map is built from entries. A name such as `__proto__` is a legal
  // AsyncAPI key, and this way it becomes an own key instead of a write to
  // the prototype.
  return Object.fromEntries(declared.map(({ name, scheme }) => [name, scheme]));
}
