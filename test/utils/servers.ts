import { Namespace, Program } from "@typespec/compiler";
import { ServerObject } from "../../src/types/index.js";
import { buildSecuritySchemes } from "../../src/builders/security-schemes.js";
import { buildServers } from "../../src/builders/servers.js";

/**
 * Builds the `servers` map the way the document builder does.
 *
 * `buildServers` needs the keys of `components.securitySchemes`, because a
 * `@useSecurity` naming anything else is dropped. The document builder reads
 * that set from the components it has just built. A test that wrote the set
 * by hand could hand the builder a scheme the document does not carry, and
 * would then assert against a document the emitter never produces.
 *
 * @param program - The compiled program
 * @param namespace - The service namespace to read the servers from
 * @returns The `servers` map, or `undefined` when the namespace declares no
 * server
 */
export function buildServersFrom(
  program: Program,
  namespace: Namespace,
): Record<string, ServerObject> | undefined {
  const declaredSchemes = new Set(Object.keys(buildSecuritySchemes(program) ?? {}));
  return buildServers(program, namespace, declaredSchemes);
}
