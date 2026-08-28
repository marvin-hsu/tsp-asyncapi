import { Model, Program } from "@typespec/compiler";
import { ChannelMessageNode } from "../service.js";
import { ChannelTarget } from "../../decorators/channels/state.js";
import { reportDiagnostic } from "../../lib.js";
import { channelMessageModels } from "../operation-models.js";

/**
 * What one channel contributes to the rest of the document.
 *
 * The map is what the channel emits. The keys are what an operation needs.
 * An operation refers to a message through the channel, so it needs the key
 * this channel gave that model. Returning the keys here means no layer
 * recomputes them.
 */
export interface ChannelMessages {
  /** The messages this channel carries, in source order. */
  messages: ChannelMessageNode[];
  /** The key this channel gave each model it carries. */
  keys: Map<Model, string>;
}

/**
 * Builds the `messages` map of one channel.
 *
 * The keys reuse what `components.messages` already assigned, from
 * `messageKeys`, so no key is computed twice. A model the message builder
 * dropped for a key clash contributes no entry here. That mistake is
 * already reported where the key was claimed.
 *
 * Entries follow the order the operations declare them, and a model two
 * operations name contributes one entry. `channelMessageModels` decides
 * which models reach this channel, including the reply of an operation on
 * another channel that names this one with `@replyChannel`.
 *
 * An empty result is reported, and the field left out. AsyncAPI allows a
 * channel with no messages, but it is almost always a payload model that
 * lost its `@message`.
 *
 * @param program - The program to report on
 * @param target - The interface or namespace that carries the channel
 * @param channelId - The key of this channel, for the warning message
 * @param messageKeys - The key each emitted message model was given
 * @returns The `messages` map and the key of each model on this channel
 */
export function resolveChannelMessages(
  program: Program,
  target: ChannelTarget,
  channelId: string,
  messageKeys: ReadonlyMap<Model, string>,
): ChannelMessages {
  const nodes: ChannelMessageNode[] = [];
  const claimed = new Set<string>();
  const keys = new Map<Model, string>();

  for (const model of channelMessageModels(program, target)) {
    const key = messageKeys.get(model);
    if (key === undefined || claimed.has(key)) continue;
    claimed.add(key);
    keys.set(model, key);
    nodes.push({ model, key });
  }

  if (nodes.length === 0) {
    reportDiagnostic(program, {
      code: "channel-no-messages",
      format: { id: channelId },
      target,
    });
  }
  return { messages: nodes, keys };
}
