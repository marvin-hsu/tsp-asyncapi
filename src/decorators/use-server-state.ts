import { Program } from "@typespec/compiler";
import { AugmentDecoratorStatementNode, DecoratorExpressionNode } from "@typespec/compiler/ast";
import { useStateMap } from "@typespec/compiler/utils";
import { ChannelTarget } from "./channel-state.js";

const useServerStateKey = Symbol.for("tsp-asyncapi.useServer");

/**
 * One `@useServer` application on a channel.
 * It is the element type of the array `getUsedServers` returns, so it is
 * part of the public surface.
 * @public
 */
export interface UseServerState {
  /** The name of the server, as it is written. */
  name: string;
  /**
   * The source node of this application.
   * The recorded list is in the order the applications ran, and that is not
   * source order. The node carries the position the emitter sorts by, and it
   * is also where the emitter reports a repeated name.
   */
  node: DecoratorExpressionNode | AugmentDecoratorStatementNode;
}

const [getUsedServersInternal, setUsedServers, getUseServerStateMap] = useStateMap<
  ChannelTarget,
  UseServerState[]
>(useServerStateKey);

export { getUsedServersInternal, setUsedServers };

/**
 * Lists every target that carries at least one `@useServer`.
 *
 * The emitter needs this to find an application that reaches no channel. A
 * `@useServer` on a target with no channel has nowhere to go, so it is
 * reported rather than dropped in silence.
 *
 * @param program - The program to read the state from
 * @returns The state map itself, keyed by target
 */
export function listUseServerTargets(program: Program): Map<ChannelTarget, UseServerState[]> {
  return getUseServerStateMap(program);
}
