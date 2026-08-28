/**
 * State recorded by `@useServer`, and the reader other modules use.
 *
 * A channel can name several servers it is available on. This module records
 * each name in the order the applications ran, and hands out copies to
 * callers.
 */

import { DecoratorContext, Program } from "@typespec/compiler";
import { AugmentDecoratorStatementNode, DecoratorExpressionNode } from "@typespec/compiler/ast";
import { SERVER_NAME_PATTERN } from "../../constants.js";
import { reportDiagnostic } from "../../lib.js";
import { ChannelTarget } from "./state.js";
import { UseServerState, getUsedServersInternal, setUsedServers } from "./use-server-state.js";

export type { UseServerState } from "./use-server-state.js";

/**
 * Limits a channel to the servers it is available on.
 *
 * The emitted channel carries a `servers` array of references into the root
 * `servers` map. AsyncAPI requires a Reference Object there, so a server is
 * never inlined into a channel.
 *
 * This decorator is repeatable, because a channel is often available on
 * several servers at once. Each application adds one reference and keeps
 * source order. A name given twice on one channel emits one reference, and
 * the repeat is reported.
 *
 * A channel with no `@useServer` at all carries no `servers` field. AsyncAPI
 * reads an absent field and an empty array alike as "available on every
 * server", so the emitter leaves the field out rather than emit an empty
 * array.
 *
 * The name is checked against the character set AsyncAPI allows for a key of
 * the root `servers` map. It is tested as written, the same way `@server`
 * tests the key it declares, so a padded name is rejected on both sides.
 * A name outside that set, a blank one included, could only emit a
 * reference no parser resolves, so it is reported and dropped.
 *
 * Whether some `@server` declares the name is checked while the document is
 * built, not here. A `@server` can still arrive after this decorator runs.
 *
 * @param context - The decorator context
 * @param target - The interface or namespace that carries the channel
 * @param name - The key of the server in the root `servers` map
 *
 * @example
 * ```typespec
 * @channel("orders.created")
 * @useServer("kafka-prod")
 * @useServer("kafka-dr")
 * interface OrderChannel {
 *   publish(event: OrderCreated): void;
 * }
 * ```
 *
 * @public
 */
export function $useServer(context: DecoratorContext, target: ChannelTarget, name: string) {
  // `decoratorTarget` is the source node of the application that is running.
  // Its static type is the wider `DiagnosticTarget`, so it is narrowed here
  // to the node kinds a decorator application can have.
  const node = context.decoratorTarget as DecoratorExpressionNode | AugmentDecoratorStatementNode;
  if (!SERVER_NAME_PATTERN.test(name)) {
    // The name is written by hand, so it is not rewritten into a legal key.
    // Rewriting it would silently change the server the author asked for.
    reportDiagnostic(context.program, {
      code: "invalid-use-server-name",
      format: { name },
      target: context.getArgumentTarget(0) ?? node,
    });
    return;
  }
  const servers = getUsedServersInternal(context.program, target) ?? [];
  servers.push({ name, node });
  setUsedServers(context.program, target, servers);
}

/**
 * Reads back every server that `@useServer` names on one target.
 * The list is in the order the applications ran, which is not source order.
 * The emitter sorts it before it emits the `servers` array.
 *
 * @param program - The program to read the state from
 * @param target - The interface or namespace the decorator was applied to
 * @returns A copy of the recorded applications. The array is empty when the
 * decorator was never applied.
 *
 * @public
 */
export function getUsedServers(program: Program, target: ChannelTarget): UseServerState[] {
  // Copy the array and every entry. The stored array is the one the decorator
  // pushes into, so handing it out lets a caller sort or push and change what
  // the emitter writes. Every other public reader here copies: `getChannel`,
  // `listChannels` and `getServers` all do.
  return (getUsedServersInternal(program, target) ?? []).map((entry) => ({ ...entry }));
}
