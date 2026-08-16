import { DecoratorContext, DiagnosticTarget, Namespace, Program } from "@typespec/compiler";
import { SERVER_NAME_PATTERN } from "../../constants.js";
import { reportDiagnostic } from "../../lib.js";
import { bySourcePosition, isSameApplication, sourcePositionOf } from "../../source-order.js";
import { AsyncAPIServerState, ServerRecord, getServersInternal, setServers } from "./state.js";

import {
  copyServerVariables,
  resolveServerVariables,
  ServerVariablesArgument,
} from "./variables.js";

export type { AsyncAPIServerState, AsyncAPIServerVariableState } from "./state.js";

/**
 * The `config` argument of `@server`, as the author wrote it.
 * It differs from the stored state in two ways. The state also holds the
 * name, which is a separate argument, and the state holds only the fields
 * that survived the checks below.
 */
type ServerConfigArgument = Omit<AsyncAPIServerState, "name" | "variables"> & {
  variables?: ServerVariablesArgument;
};

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
  config: ServerConfigArgument,
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

  // The templates are read from the trimmed values, so the names checked
  // here are the names the emitted document carries.
  const variables = resolveServerVariables(
    context,
    server.host,
    server.pathname,
    config.variables,
    configTarget,
  );
  if (variables !== undefined) server.variables = variables;

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
 * `host` and `pathname` may both carry `{var}` templates. Every name used
 * there needs an entry in `variables`. A name with no entry is reported, and
 * the server is still emitted with the template text unchanged.
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
  config: ServerConfigArgument,
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

  const record: ServerRecord = {
    server,
    ...sourcePositionOf(context.decoratorTarget),
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
    if (isSameApplication(existing, record)) {
      return;
    }
    const dropped = bySourcePosition(context.program)(record, existing) < 0 ? existing : record;
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
 * returned objects. The change stays with the caller. The copy reaches the
 * variables as well, because they are a nested graph that a shallow copy
 * would still share.
 *
 * @public
 */
export function getServers(program: Program, target: Namespace): AsyncAPIServerState[] {
  const records = getServersInternal(program, target) ?? [];
  return [...records].sort(bySourcePosition(program)).map((record) => ({
    ...record.server,
    ...(record.server.variables ? { variables: copyServerVariables(record.server.variables) } : {}),
  }));
}
