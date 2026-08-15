import {
  DecoratorContext,
  DiagnosticTarget,
  Namespace,
  Program,
  getSourceLocation,
} from "@typespec/compiler";
import { reportDiagnostic } from "../lib.js";
import {
  AsyncAPIServerState,
  ServerRecord,
  compareServerRecords,
  getServersInternal,
  setServers,
} from "./server-state.js";

export type { AsyncAPIServerState } from "./server-state.js";

/**
 * The character set AsyncAPI 3 allows for a key of the root `servers` map.
 * This pattern is stricter than the one for keys of the Components Object.
 * A dot is not allowed here.
 */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Turns the `config` argument of `@server` into the state to store.
 * Every string field is trimmed. A required field that is blank after the
 * trim makes the whole server invalid. The function then reports the field
 * and returns `undefined`, so the caller drops the server.
 * An optional field that is blank after the trim carries no value. It is
 * left absent, the same as a field the author left out.
 *
 * @param context - The decorator context
 * @param name - The name argument of the decorator
 * @param config - The config argument of the decorator
 * @param configTarget - The node to report a field problem on
 * @returns The state to store, or `undefined` when a required field is blank
 */
function normalizeServerConfig(
  context: DecoratorContext,
  name: string,
  config: Omit<AsyncAPIServerState, "name">,
  configTarget: DiagnosticTarget,
): AsyncAPIServerState | undefined {
  // `host` and `protocol` are required by AsyncAPI. A blank value passes the
  // type check but makes the document invalid, so the server is dropped.
  for (const field of ["host", "protocol"] as const) {
    if (config[field].trim() === "") {
      reportDiagnostic(context.program, {
        code: "empty-server-field",
        format: { field },
        target: configTarget,
      });
      return undefined;
    }
  }

  // The value that passed the check above is the value that is emitted, so
  // the required fields are stored trimmed.
  const server: AsyncAPIServerState = {
    name,
    host: config.host.trim(),
    protocol: config.protocol.trim(),
  };

  for (const field of ["protocolVersion", "pathname", "title", "summary", "description"] as const) {
    const value = config[field]?.trim();
    if (value !== undefined && value !== "") server[field] = value;
  }

  return server;
}

/**
 * Declares one server the application connects to.
 * This decorator is repeatable. Each application appends its own server
 * record rather than replacing a prior one. The `name` argument becomes the
 * key of that server in the emitted `servers` map.
 *
 * Apply this decorator to the service namespace. The emitter reads the
 * servers from that namespace only. A server declared on any other namespace
 * stays out of the emitted document.
 *
 * The servers keep the order they are written in. This holds for a stacked
 * decorator and for an augment decorator alike. Two servers with the same
 * name are a mistake. The one written first is kept, and the other one is
 * dropped with a diagnostic.
 *
 * Every field is trimmed. A required field that is blank after the trim
 * drops the server with a diagnostic. An optional field that is blank after
 * the trim carries no value, so it is stored as absent and stays out of the
 * emitted document.
 *
 * @param context - The decorator context
 * @param target - The namespace to apply this decorator to
 * @param name - The key for this server in the emitted `servers` map
 * @param config - The server fields matching the AsyncAPIServer shape
 *
 * @example
 * ```typespec
 * @server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
 * @server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $server(
  context: DecoratorContext,
  target: Namespace,
  name: string,
  config: Omit<AsyncAPIServerState, "name">,
) {
  // Report on the name argument. Both name problems below point here.
  const nameTarget = context.getArgumentTarget(0) ?? target;
  // Report on the config argument. Both field problems below point here.
  const configTarget = context.getArgumentTarget(1) ?? target;

  if (!SERVER_NAME_PATTERN.test(name)) {
    // The name is written by hand, so it is not rewritten to a legal key.
    // Rewriting it would silently change the key the author asked for.
    reportDiagnostic(context.program, {
      code: "invalid-server-name",
      format: { name },
      target: nameTarget,
    });
    return;
  }

  const server = normalizeServerConfig(context, name, config, configTarget);
  if (server === undefined) return;

  const location = getSourceLocation(context.decoratorTarget);
  const record: ServerRecord = {
    server,
    file: location.file.path,
    pos: location.pos,
    nameTarget,
  };

  const servers = getServersInternal(context.program, target) ?? [];

  // Source position decides the winner of a name clash, not evaluation
  // order. The application written first in the file is kept, and the other
  // one is dropped.
  const clashIndex = servers.findIndex((existing) => existing.server.name === name);
  if (clashIndex >= 0) {
    const existing = servers[clashIndex];
    // The same statement can run more than once. An augment decorator runs
    // once per declaration of its target namespace, so one `@@server` runs
    // again for every reopened `namespace` block and for every file that
    // opens the namespace. Those runs are one application, not a clash.
    // Two distinct statements can never share a file and a position, so a
    // real duplicate is still reported.
    if (existing.file === record.file && existing.pos === record.pos) {
      return;
    }
    const dropped = compareServerRecords(record, existing) < 0 ? existing : record;
    if (dropped === existing) servers[clashIndex] = record;
    reportDiagnostic(context.program, {
      code: "duplicate-server-name",
      format: { name },
      target: dropped.nameTarget,
    });
    setServers(context.program, target, servers);
    return;
  }

  servers.push(record);
  setServers(context.program, target, servers);
}

/**
 * Reads back the servers declared by `@server`.
 *
 * @param program - The program to read the state from
 * @param target - The namespace the decorator was applied to
 * @returns A copy of the recorded servers, in source order. The list is
 * empty when the decorator was never applied. The caller may change the
 * returned objects. The change stays with the caller.
 *
 * @public
 */
export function getServers(program: Program, target: Namespace): AsyncAPIServerState[] {
  const records = getServersInternal(program, target) ?? [];
  return [...records].sort(compareServerRecords).map((record) => ({ ...record.server }));
}
