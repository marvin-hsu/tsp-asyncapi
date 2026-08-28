import { Namespace, Program } from "@typespec/compiler";
import { ServerObject } from "#emitter/types/index.js";
import { builtSecuritySchemes } from "./security-schemes.js";
import { BindingPlacements } from "#core/resolve/bindings.js";
import { resolveServers } from "#core/resolve/servers.js";
import { lowerServers } from "#emitter/lower/servers.js";
import { noPromotions } from "./promotions.js";

/**
 * Builds the `servers` map the way the document builder does.
 *
 * `resolveServers` needs the keys of `components.securitySchemes`, because
 * `@useSecurity` naming any other scheme is dropped. The document builder
 * reads that set from the components it just built, so a hand-written set
 * could name a scheme the real document never carries.
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
  const declaredSchemes = new Set(Object.keys(builtSecuritySchemes(program) ?? {}));
  return lowerServers(
    resolveServers(program, namespace, declaredSchemes, new BindingPlacements()),
    noPromotions(),
  );
}
