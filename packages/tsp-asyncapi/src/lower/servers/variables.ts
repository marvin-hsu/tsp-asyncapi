/**
 * The lower half of one server's address variables.
 *
 * A Server Variable Object carries no name of its own: the author wrote it
 * as the key of the `variables` map. So the key is the name, and a variable
 * is shared through `components.serverVariables` on its first use.
 *
 * Sharing here will rarely fire. A variable's scope is one server, so two
 * servers carrying the same one is a coincidence of text rather than a
 * shared thing. It follows the same rule as the rest because a document
 * should not clean its keys two ways, not because it saves bytes.
 *
 * Only the builder lives here, not the map. The survey in
 * `components/survey.ts` needs it before anything is written, while the map
 * needs the survey's answer. Splitting them is what keeps `servers.ts` and
 * `survey.ts` from importing each other.
 */

import type { ServerVariableNode } from "tsp-asyncapi-core/unstable";
import type { ServerVariableObject } from "../../types/index.js";

/**
 * Turns one resolved variable into a Server Variable Object.
 *
 * @param node - The resolved variable
 * @returns The Server Variable Object
 * @internal
 */
export function lowerServerVariable(node: ServerVariableNode): ServerVariableObject {
  const variable: ServerVariableObject = {};
  if (node.enum !== undefined) variable.enum = [...node.enum];
  if (node.default !== undefined) variable.default = node.default;
  if (node.description !== undefined) variable.description = node.description;
  if (node.examples !== undefined) variable.examples = [...node.examples];
  return variable;
}
