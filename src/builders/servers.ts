import { getNamespaceFullName, Namespace, Program } from "@typespec/compiler";
import { ServerObject } from "../types/index.js";
import { getServers } from "../decorators/index.js";
import { listServersOutsideService } from "../decorators/server-state.js";
import { reportDiagnostic } from "../lib.js";

/**
 * Builds the AsyncAPI `servers` map from the `@server` decorators on a
 * namespace.
 *
 * The decorator already checked each server. It reported a diagnostic and
 * dropped any server with a bad or repeated name, or with a blank required
 * field. So every record here is safe to use as a key.
 *
 * @returns The `servers` map, or `undefined` when the namespace declares no
 * server. The caller then omits the field.
 */
export function buildServers(
  program: Program,
  namespace: Namespace,
): Record<string, ServerObject> | undefined {
  const declared = getServers(program, namespace);
  if (declared.length === 0) {
    return undefined;
  }

  const entries: [string, ServerObject][] = [];
  for (const {
    name,
    host,
    protocol,
    protocolVersion,
    pathname,
    title,
    summary,
    description,
  } of declared) {
    const server: ServerObject = { host, protocol };
    // The decorator stores an optional field only when it holds a value. A
    // blank field is already stored as absent. So an absent field here is
    // left out of the output, and no empty value is ever emitted.
    if (protocolVersion !== undefined) server.protocolVersion = protocolVersion;
    if (pathname !== undefined) server.pathname = pathname;
    if (title !== undefined) server.title = title;
    if (summary !== undefined) server.summary = summary;
    if (description !== undefined) server.description = description;
    entries.push([name, server]);
  }

  // The map is built from entries. A name such as `__proto__` is a legal
  // AsyncAPI key, and this way it becomes an own key instead of a write to
  // the prototype. A plain assignment would drop such a server.
  return Object.fromEntries(entries);
}

/**
 * Reports every `@server` that sits outside the service namespace.
 *
 * Such a server never reaches the document. Dropping it in silence hides an
 * author mistake, so each one gets a warning that names the namespace it
 * sits on.
 *
 * @param program - The program to read the servers from
 * @param service - The service namespace, or `undefined` when the program
 * declares no service
 */
export function reportServersOutsideService(
  program: Program,
  service: Namespace | undefined,
): void {
  for (const { namespace, name, target } of listServersOutsideService(program, service)) {
    reportDiagnostic(program, {
      code: "server-outside-service",
      format: { name, namespace: getNamespaceFullName(namespace) },
      target,
    });
  }
}
