/**
 * The resolve half of the security schemes.
 *
 * The schemes come from the whole program, not from the service namespace.
 * `components.securitySchemes` is a document-wide registry, and a scheme is
 * reached by name rather than by the namespace it sits on.
 */

import { Program } from "@typespec/compiler";
import { getSecuritySchemes } from "../decorators/security/scheme.js";
import { listSecuritySchemeRecords } from "../decorators/security/scheme-state.js";
import { SecuritySchemeNode } from "./service.js";

/**
 * Resolves every `@securityScheme` the program declares.
 *
 * The decorator already checked each scheme. It reported a diagnostic and
 * dropped any scheme with a bad or repeated name, a blank required field, or
 * an unusable set of OAuth flows. So every record here is safe to use as a
 * key.
 *
 * @internal
 */
export function resolveSecuritySchemes(program: Program): readonly SecuritySchemeNode[] {
  const states = getSecuritySchemes(program);
  const records = listSecuritySchemeRecords(program);
  // Both lists come from one sorted read, so index `i` names one scheme in
  // both. The state list is the copied one, and the record list is what
  // carries the diagnostic target.
  return states.map((state, index) => ({
    target: records[index].nameTarget,
    name: state.name,
    scheme: state.scheme,
  }));
}
