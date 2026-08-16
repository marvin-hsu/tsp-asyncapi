import { DecoratorContext, Program } from "@typespec/compiler";
import { AugmentDecoratorStatementNode, DecoratorExpressionNode } from "@typespec/compiler/ast";
import { ChannelTarget } from "./channel-state.js";
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
 * several servers at once. Each application adds one reference rather than
 * replacing a prior one, and the references keep their source order. A name
 * given twice on one channel emits one reference, and the repeat is
 * reported.
 *
 * A channel with no `@useServer` at all carries no `servers` field. AsyncAPI
 * reads an absent field and an empty array alike as "available on every
 * server", so the emitter leaves the field out rather than emit an empty
 * array.
 *
 * The name is not checked against the declared servers. This emitter takes a
 * bare string here, and a name that no `@server` declares produces a
 * reference that resolves to nothing. That cost is accepted, so a channel
 * can name a server that another document declares.
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
