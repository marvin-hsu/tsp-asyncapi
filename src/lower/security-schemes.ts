/**
 * The lower half of the security schemes.
 */

import type { SecuritySchemeNode } from "../resolve/service.js";
import { SecuritySchemeObject } from "../types/index.js";

/**
 * Builds the `components.securitySchemes` map from resolved nodes.
 *
 * @param nodes - The resolved schemes, in source order
 * @returns The map, or `undefined` when there is no scheme. The caller then
 * omits the field.
 * @internal
 */
export function lowerSecuritySchemes(
  nodes: readonly SecuritySchemeNode[],
): Record<string, SecuritySchemeObject> | undefined {
  if (nodes.length === 0) return undefined;
  // The map is built from entries. A name such as `__proto__` is a legal
  // AsyncAPI key, and this way it becomes an own key instead of a write to
  // the prototype.
  return Object.fromEntries(nodes.map((node) => [node.name, node.scheme]));
}
