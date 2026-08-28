import { DiagnosticTarget, Namespace, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { SourcePosition, bySourcePosition } from "../../source-order.js";

const serverStateKey = Symbol.for("tsp-asyncapi.server");

/**
 * One value that a `{var}` template of `host` or `pathname` stands for.
 * It is part of the state `getServers` returns.
 * @public
 */
export interface AsyncAPIServerVariableState {
  /** The values this variable is allowed to take. */
  enum?: string[];
  /** The value used when a client supplies none. */
  default?: string;
  /** A description of the variable. */
  description?: string;
  /** Example values for this variable. */
  examples?: string[];
}

/**
 * One server declared by `@server`. It is the element type `getServers`
 * returns.
 * @public
 */
export interface AsyncAPIServerState {
  /** The key this server takes in the emitted `servers` map. */
  name: string;
  host: string;
  protocol: string;
  protocolVersion?: string;
  pathname?: string;
  title?: string;
  summary?: string;
  description?: string;
  /** The values for the `{var}` templates of `host` and `pathname`. */
  variables?: Record<string, AsyncAPIServerVariableState>;
}

/**
 * One `@server` application, with the source position it was written at.
 * The position orders the servers and settles a name clash.
 */
export interface ServerRecord extends SourcePosition {
  server: AsyncAPIServerState;
  /** Where to report a problem about the name of this application. */
  nameTarget: DiagnosticTarget;
}

const [getServersInternal, setServers, getServerStateMap] = useStateMap<Namespace, ServerRecord[]>(
  serverStateKey,
);

export { getServersInternal, setServers };

/**
 * True when a namespace carries at least one server that survived its own
 * checks.
 */
export function namespaceHasServers(program: Program, namespace: Namespace): boolean {
  return (getServersInternal(program, namespace)?.length ?? 0) > 0;
}

/**
 * One server that the emitter leaves out of the document, because it sits on
 * a namespace other than the service namespace.
 */
export interface StrayServerRecord {
  /** The namespace that carries this `@server`. */
  namespace: Namespace;
  /** The name given to this server. */
  name: string;
  /** Where to report a problem about this application. */
  target: DiagnosticTarget;
}

/**
 * Lists the servers that sit outside the service namespace, in source order.
 *
 * The emitter reads servers from the service namespace only. Any other
 * server is dropped, so the caller reports it instead of dropping it in
 * silence. When `service` is `undefined`, every server is outside it.
 */
export function listServersOutsideService(
  program: Program,
  service: Namespace | undefined,
): StrayServerRecord[] {
  const stray: { namespace: Namespace; record: ServerRecord }[] = [];
  for (const [namespace, records] of getServerStateMap(program)) {
    if (namespace === service) continue;
    for (const record of records) stray.push({ namespace, record });
  }

  const compare = bySourcePosition(program);
  stray.sort((a, b) => compare(a.record, b.record));

  return stray.map(({ namespace, record }) => ({
    namespace,
    name: record.server.name,
    target: record.nameTarget,
  }));
}
