/**
 * The resolve half of the servers.
 *
 * It reads the `@server` state of the service namespace, plus the security
 * scheme names, external documentation, and tags that namespace contributes
 * to every server. It also reports the two mistakes about server placement,
 * not about one server's own fields.
 *
 * What it produces is a list of `ServerNode`, already in source order. The
 * lower half turns those into Server Objects and reads no state.
 */

import { getNamespaceFullName, Namespace, Program } from "@typespec/compiler";
import { getServers } from "../decorators/index.js";
import {
  AsyncAPIServerVariableState,
  listServersOutsideService,
  namespaceHasServers,
} from "../decorators/servers/state.js";
import {
  listSecurityUsesWithoutServer,
  listUsedSecuritySchemes,
  UseSecurityTarget,
} from "../decorators/security/use-security-state.js";
import { reportDiagnostic } from "../lib.js";
import { BindingPlacements, resolveBindings } from "./bindings.js";
import { buildExternalDocs } from "../external-docs.js";
import { buildTags } from "./tags.js";
import { ServerNode, ServerVariableNode } from "./service.js";

/**
 * Resolves the security scheme names of one namespace or operation.
 *
 * A name no `@securityScheme` defines is reported and dropped here. The
 * reference the lower half writes would otherwise address a key the document
 * does not carry, and a parser rejects the whole document for it.
 * `@useSecurity` cannot make this check itself. A `@securityScheme` anywhere
 * in the program can still arrive after it runs. The full set of names is
 * known only once the whole program is read.
 *
 * Only the names are carried. Turning a name into a reference is a document
 * detail that belongs to the lower half.
 *
 * @param program - The program to read the applications from
 * @param target - The namespace or operation that carries the `@useSecurity`
 * @param declaredSchemes - The keys of `components.securitySchemes`
 * @returns The surviving names, in source order
 * @internal
 */
export function resolveSecuritySchemeNames(
  program: Program,
  target: UseSecurityTarget,
  declaredSchemes: ReadonlySet<string>,
): readonly string[] {
  const names: string[] = [];
  for (const { schemeName, target: applicationTarget } of listUsedSecuritySchemes(
    program,
    target,
  )) {
    if (!declaredSchemes.has(schemeName)) {
      reportDiagnostic(program, {
        code: "undeclared-security-scheme",
        format: { schemeName },
        target: applicationTarget,
      });
      continue;
    }
    names.push(schemeName);
  }
  return names;
}

/** Turns the recorded variables of one server into resolved nodes. */
function resolveServerVariables(
  variables: Record<string, AsyncAPIServerVariableState>,
): ReadonlyMap<string, ServerVariableNode> {
  const resolved = new Map<string, ServerVariableNode>();
  for (const [name, state] of Object.entries(variables)) {
    // The decorator stores a field only when it holds a value, so an absent
    // field stays absent rather than becoming an empty one.
    resolved.set(name, {
      ...(state.enum !== undefined ? { enum: state.enum } : {}),
      ...(state.default !== undefined ? { default: state.default } : {}),
      ...(state.description !== undefined ? { description: state.description } : {}),
      ...(state.examples !== undefined ? { examples: state.examples } : {}),
    });
  }
  return resolved;
}

/**
 * Names every server the document will hold.
 *
 * `@useServer` addresses a server by this key, and a key the document does
 * not carry makes the whole document fail validation. The set is read before
 * the channels are resolved, because the channel is where the reference is
 * written.
 *
 * Only the service namespace is read, since a `@server` anywhere else never
 * reaches the document and is reported on its own.
 *
 * @param program - The program to read the servers from
 * @param namespace - The service namespace, or `undefined` when the program
 * declares no service
 * @returns The declared server names
 * @internal
 */
export function declaredServerNames(
  program: Program,
  namespace: Namespace | undefined,
): ReadonlySet<string> {
  if (namespace === undefined) return new Set();
  return new Set(getServers(program, namespace).map((state) => state.name));
}

/**
 * Resolves the servers of the service namespace.
 *
 * The decorator already checked each server, reporting and dropping any with
 * a bad or repeated name or a blank required field. Every record here is
 * safe to use as a key.
 *
 * `security`, `externalDocs`, and `tags` come from the namespace rather than
 * from one server, so every server the namespace declares carries the same
 * value for all three. They are read once and shared here. The lower half
 * gives each server its own copy. That is where a shared value would
 * otherwise turn into a shared object in the output.
 *
 * The `externalDocs` and `tags` of the namespace also reach `info`, since
 * `info` reads that same namespace. The duplication is intended: AsyncAPI
 * defines both fields on both objects, and a reader of a server should not
 * have to look at `info`.
 *
 * @param program - The program to read the servers from
 * @param namespace - The service namespace
 * @param declaredSchemes - The keys of `components.securitySchemes`
 * @param placements - Where the binding applications this build placed are
 * recorded
 * @returns The servers, in source order. An empty list means the namespace
 * declares none.
 * @internal
 */
export function resolveServers(
  program: Program,
  namespace: Namespace,
  declaredSchemes: ReadonlySet<string>,
  placements: BindingPlacements,
): readonly ServerNode[] {
  const declared = getServers(program, namespace);
  if (declared.length === 0) return [];

  const security = resolveSecuritySchemeNames(program, namespace, declaredSchemes);
  const externalDocs = buildExternalDocs(program, namespace);
  const tags = buildTags(program, namespace) ?? [];
  const bindings = resolveBindings(program, "server", namespace, placements);

  return declared.map((state) => ({
    target: namespace,
    name: state.name,
    host: state.host,
    protocol: state.protocol,
    ...(state.protocolVersion !== undefined ? { protocolVersion: state.protocolVersion } : {}),
    ...(state.pathname !== undefined ? { pathname: state.pathname } : {}),
    ...(state.title !== undefined ? { title: state.title } : {}),
    ...(state.summary !== undefined ? { summary: state.summary } : {}),
    ...(state.description !== undefined ? { description: state.description } : {}),
    ...(state.variables !== undefined
      ? { variables: resolveServerVariables(state.variables) }
      : {}),
    security,
    ...(externalDocs !== undefined ? { externalDocs } : {}),
    tags,
    bindings,
  }));
}

/**
 * Reports every `@server` that sits outside the service namespace.
 *
 * Such a server never reaches the document. Dropping it in silence hides an
 * author mistake, so each one gets a warning that names the namespace it sits
 * on.
 *
 * @param program - The program to read the servers from
 * @param service - The service namespace, or `undefined` when the program
 * declares no service
 * @internal
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

/**
 * Reports every `@useSecurity` on a namespace whose servers never reach the
 * document.
 *
 * The `security` array sits on a server object, so such an application has
 * nowhere to go and changes nothing, the same silent failure
 * `server-outside-service` guards against.
 *
 * Only the service namespace's servers are emitted. A `@server` elsewhere is
 * not enough: it is dropped and reported. The `@useSecurity` beside it has
 * just as little to attach to. Reading the recorded state alone would call
 * that namespace served and miss the second mistake.
 *
 * @param program - The program to read the applications from
 * @param service - The namespace the document is emitted from, if there is one
 * @internal
 */
export function reportSecurityUsesWithoutServer(
  program: Program,
  service: Namespace | undefined,
): void {
  const stray = listSecurityUsesWithoutServer(
    program,
    (namespace) =>
      service !== undefined && namespace === service && namespaceHasServers(program, namespace),
  );
  for (const { namespace, schemeName, target } of stray) {
    reportDiagnostic(program, {
      code: "use-security-outside-server",
      format: { schemeName, namespace: getNamespaceFullName(namespace) },
      target,
    });
  }
}
