/**
 * The lower half of the servers.
 *
 * `lower` is LLVM's word. It means turning a target-neutral intermediate
 * representation into one target's own. Here the IR is `AsyncAPIService`, and
 * the target is the AsyncAPI document. A second target, such as generated
 * source code, would be a sibling of this folder reading the same IR.
 *
 * This half turns resolved nodes into the root `servers` map. It reads no
 * decorator state and reports no diagnostic. Which servers reach the document,
 * and which security scheme names survived, were both settled in resolve.
 */

import type { ServerNode, ServerVariableNode } from "tsp-asyncapi-core/unstable";
import { ReferenceObject, ServerObject, ServerVariableObject } from "../types/index.js";
import { securitySchemeRef } from "./json-pointer.js";
import { lowerServerVariable } from "./servers/variables.js";
import type { DocumentPromotions } from "./components/survey.js";
import { shared, sharedSiteFields } from "./components/survey.js";

/** Turns the resolved variables of one server into Server Variable Objects. */
function lowerServerVariables(
  variables: ReadonlyMap<string, ServerVariableNode>,
  promoted: DocumentPromotions,
): Record<string, ServerVariableObject | ReferenceObject> {
  const entries: [string, ServerVariableObject | ReferenceObject][] = [];
  for (const [name, node] of variables) {
    entries.push([
      name,
      shared(promoted.serverVariables, "serverVariables", lowerServerVariable(node), name),
    ]);
  }
  // Built as an entry: a plain assignment of a name such as `__proto__`
  // would write the prototype and lose the variable.
  return Object.fromEntries(entries);
}

/** Turns one resolved server into a Server Object. */
function lowerServer(node: ServerNode, promoted: DocumentPromotions): ServerObject {
  const server: ServerObject = { host: node.host, protocol: node.protocol };
  // The field order follows the Server Object table of the specification.
  if (node.protocolVersion !== undefined) server.protocolVersion = node.protocolVersion;
  if (node.pathname !== undefined) server.pathname = node.pathname;
  if (node.title !== undefined) server.title = node.title;
  if (node.summary !== undefined) server.summary = node.summary;
  if (node.description !== undefined) server.description = node.description;
  if (node.variables !== undefined)
    server.variables = lowerServerVariables(node.variables, promoted);

  // Each server gets its own security list, so editing one server cannot
  // reach another. The three fragments below come from the namespace;
  // `sharedSiteFields` hands each server a reference or a deep copy.
  if (node.security.length > 0) {
    const security: ReferenceObject[] = node.security.map((name) => ({
      $ref: securitySchemeRef(name),
    }));
    server.security = security;
  }
  const site = sharedSiteFields(promoted, "serverBindings", node);
  if (site.externalDocs !== undefined) server.externalDocs = site.externalDocs;
  if (site.tags !== undefined) server.tags = site.tags;
  if (site.bindings !== undefined) server.bindings = site.bindings;
  return server;
}

/**
 * Builds the root `servers` map from resolved nodes.
 *
 * @param nodes - The resolved servers, in source order
 * @param promoted - The closed surveys, asked what each shared fragment writes
 * @returns The `servers` map, or `undefined` when there is no node. The caller
 * then omits the field.
 * @internal
 */
export function lowerServers(
  nodes: readonly ServerNode[],
  promoted: DocumentPromotions,
): Record<string, ServerObject> | undefined {
  if (nodes.length === 0) return undefined;
  // Built from entries: a name such as `__proto__` is a legal AsyncAPI key,
  // and a plain assignment would write the prototype and drop the server.
  return Object.fromEntries(nodes.map((node) => [node.name, lowerServer(node, promoted)]));
}
