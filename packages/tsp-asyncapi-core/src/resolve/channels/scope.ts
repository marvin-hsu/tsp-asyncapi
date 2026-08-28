/**
 * What one channel owns.
 *
 * A channel owns the operations declared directly inside the interface or
 * namespace it sits on. A nested interface, and a namespace nested inside a
 * namespace, are separate scopes, each free to carry a channel of its own.
 * Collecting across scopes would put one operation on two channels, and let
 * one namespace-level channel absorb everything under it.
 *
 * The messages collection and the parameters collection both walk this
 * scope, so the rule has one definition here. The operation builder needs
 * the inverse of the same rule, so that inverse lives here too.
 */

import { Operation, Program } from "@typespec/compiler";
import { ChannelTarget } from "../../decorators/channels/state.js";
import { bySourcePosition, sourcePositionOf } from "../../source-order.js";

/**
 * Lists the operations one channel owns, in source order.
 *
 * The compiler stores interface and namespace members in a map, and that
 * map's order is not guaranteed to be source order. Callers that pick "the
 * first one in source order" as a winner need the order restored here.
 *
 * @param program - The program the channel belongs to
 * @param target - The interface or namespace that carries the channel
 * @returns The operations declared directly inside it, in source order
 */
export function channelOperations(program: Program, target: ChannelTarget): Operation[] {
  const compare = bySourcePosition(program);
  return [...target.operations.values()].sort((a, b) =>
    compare(sourcePositionOf(a), sourcePositionOf(b)),
  );
}

/**
 * Names the interface or namespace whose channel one operation belongs to.
 *
 * This is the inverse of `channelOperations`. The interface wins over the
 * namespace. An operation inside a nested interface carries both, and a
 * nested interface is a separate scope. Letting the namespace claim such an
 * operation would break the scope rule this module states.
 *
 * The result is a candidate, not an answer. The caller checks it against the
 * channels that reached the document, because a target may carry no channel
 * at all, and a declared channel may have been dropped.
 *
 * @param operation - The operation to place
 * @returns The interface or namespace around it, or `undefined` when it sits
 * in neither
 */
export function owningChannelTarget(operation: Operation): ChannelTarget | undefined {
  return operation.interface ?? operation.namespace;
}
