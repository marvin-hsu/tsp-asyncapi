import { getNamespaceFullName, Namespace, Program } from "@typespec/compiler";
import { ReferenceObject, ServerObject, ServerVariableObject } from "../types/index.js";
import { getServers } from "../decorators/index.js";
import {
  AsyncAPIServerState,
  AsyncAPIServerVariableState,
  listServersOutsideService,
  namespaceHasServers,
} from "../decorators/server-state.js";
import {
  listSecurityUsesWithoutServer,
  listUsedSecuritySchemes,
} from "../decorators/use-security-state.js";
import { buildExternalDocs } from "./external-docs.js";
import { reportDiagnostic } from "../lib.js";
import { SECURITY_SCHEME_REF_PREFIX } from "../constants.js";

/**
 * Turns the recorded variables of one server into Server Variable Objects.
 *
 * The decorator stores a field only when it holds a value, so an absent
 * field here is left out of the output.
 */
function buildServerVariables(
  variables: Record<string, AsyncAPIServerVariableState>,
): Record<string, ServerVariableObject> {
  const entries: [string, ServerVariableObject][] = [];
  for (const [name, { enum: allowed, default: fallback, description, examples }] of Object.entries(
    variables,
  )) {
    const variable: ServerVariableObject = {};
    if (allowed !== undefined) variable.enum = allowed;
    if (fallback !== undefined) variable.default = fallback;
    if (description !== undefined) variable.description = description;
    if (examples !== undefined) variable.examples = examples;
    entries.push([name, variable]);
  }
  // A variable name is written by the author, so it is built as an entry
  // rather than assigned. A plain assignment of a name such as `__proto__`
  // would write the prototype and lose the entry. The compiler drops that
  // one key while it marshals the object value, so no such name reaches
  // here today. The entry form costs nothing and does not depend on that.
  return Object.fromEntries(entries);
}

/**
 * Turns one recorded server into a Server Object.
 *
 * The decorator stores an optional field only when it holds a value. A
 * blank field is already stored as absent. So an absent field here is left
 * out of the output, and no empty value is ever emitted.
 *
 * The fields that come from the namespace rather than from this server are
 * not set here. The caller adds them.
 */
function buildServer(state: AsyncAPIServerState): ServerObject {
  const { host, protocol, protocolVersion, pathname, title, summary, description, variables } =
    state;
  const server: ServerObject = { host, protocol };
  if (protocolVersion !== undefined) server.protocolVersion = protocolVersion;
  if (pathname !== undefined) server.pathname = pathname;
  if (title !== undefined) server.title = title;
  if (summary !== undefined) server.summary = summary;
  if (description !== undefined) server.description = description;
  if (variables !== undefined) server.variables = buildServerVariables(variables);
  return server;
}

/**
 * Builds the `security` array of every server on one namespace.
 *
 * Each entry is a reference into `components.securitySchemes`. AsyncAPI
 * allows an inline scheme here as well, and this emitter never writes one,
 * so a server always points at the shared definition.
 *
 * A name that no `@securityScheme` defines is reported and dropped. The
 * reference would address a key that the document does not carry, and an
 * AsyncAPI parser rejects the whole document for it. `@useSecurity` cannot
 * make this check itself, because a `@securityScheme` anywhere in the
 * program can still arrive after it runs. Here the full set is known.
 *
 * @param program - The program to read the applications from
 * @param namespace - The namespace that carries the servers
 * @param declaredSchemes - The keys of `components.securitySchemes`
 * @returns The `security` array, or `undefined` when no entry survives. The
 * caller then omits the field, because AsyncAPI reads an empty array as
 * "this server needs no scheme at all".
 */
function buildServerSecurity(
  program: Program,
  namespace: Namespace,
  declaredSchemes: ReadonlySet<string>,
): ReferenceObject[] | undefined {
  const references: ReferenceObject[] = [];
  for (const { schemeName, target } of listUsedSecuritySchemes(program, namespace)) {
    if (!declaredSchemes.has(schemeName)) {
      reportDiagnostic(program, {
        code: "undeclared-security-scheme",
        format: { schemeName },
        target,
      });
      continue;
    }
    references.push({ $ref: `${SECURITY_SCHEME_REF_PREFIX}${schemeName}` });
  }
  return references.length > 0 ? references : undefined;
}

/**
 * Builds the AsyncAPI `servers` map from the `@server` decorators on a
 * namespace.
 *
 * The decorator already checked each server. It reported a diagnostic and
 * dropped any server with a bad or repeated name, or with a blank required
 * field. So every record here is safe to use as a key.
 *
 * `security` and `externalDocs` come from the namespace, not from the
 * single server. So every server the namespace declares carries the same
 * value for both.
 *
 * The `externalDocs` of the namespace also reaches `info.externalDocs`,
 * because the servers are read from the service namespace and `info` reads
 * that same namespace. The duplication is intended. AsyncAPI defines the
 * field on both objects, and a reader of a server object should not have to
 * look at `info` to find the link.
 *
 * @param program - The program to read the servers from
 * @param namespace - The service namespace
 * @param declaredSchemes - The keys of `components.securitySchemes`. A
 * `@useSecurity` naming anything else is reported and dropped.
 * @returns The `servers` map, or `undefined` when the namespace declares no
 * server. The caller then omits the field.
 */
export function buildServers(
  program: Program,
  namespace: Namespace,
  declaredSchemes: ReadonlySet<string>,
): Record<string, ServerObject> | undefined {
  const declared = getServers(program, namespace);
  if (declared.length === 0) {
    return undefined;
  }

  const security = buildServerSecurity(program, namespace, declaredSchemes);
  const externalDocs = buildExternalDocs(program, namespace);

  const entries: [string, ServerObject][] = declared.map((state) => {
    const server = buildServer(state);
    // Each server gets its own copy of the shared values, so a later change
    // to one server cannot reach another.
    if (security !== undefined) server.security = security.map((ref) => ({ ...ref }));
    if (externalDocs !== undefined) server.externalDocs = { ...externalDocs };
    return [state.name, server];
  });

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

/**
 * Reports every `@useSecurity` on a namespace whose servers never reach the
 * document.
 *
 * The `security` array sits on a server object, so such an application has
 * nowhere to go and changes nothing. This is the same silent failure that
 * `server-outside-service` was added for.
 *
 * A namespace that declares a server is not enough. Only the service
 * namespace's servers are emitted, so a `@server` elsewhere is dropped and
 * reported, and the `@useSecurity` beside it has just as little to attach to.
 * Reading the recorded state alone would call that namespace served and let
 * the second mistake pass without a word.
 *
 * @param program - The program to read the applications from
 * @param service - The namespace the document is emitted from, if there is one
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
