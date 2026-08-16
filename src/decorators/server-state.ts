import { DiagnosticTarget, Namespace, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { SourcePosition, bySourcePosition } from "../source-order.js";

const serverStateKey = Symbol.for("tsp-asyncapi.server");

/**
 * State interface representing one server declared by `@server`.
 * @internal
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
}

/**
 * One `@server` application, with the source position it was written at.
 * The position orders the servers and picks the winner of a name clash.
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
 * Lists the servers that sit outside the service namespace.
 *
 * The emitter reads servers from the service namespace only. Any other
 * server is dropped, so the caller reports it instead of dropping it in
 * silence.
 *
 * @param program - The program to read the state from
 * @param service - The service namespace, or `undefined` when the program
 * declares no service. Every server is then outside the service.
 * @returns The stray servers, in source order.
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
