/**
 * The messages one channel carries.
 *
 * It reads the key each message model was given in `components.messages`,
 * and asks `channelMessageModels` which models reach this channel at all.
 *
 * It decides the channel's `messages` map, and the key this channel gave
 * each model, so no other layer has to recompute either one.
 *
 * The lower half turns the map into `$ref` entries. This module never
 * writes a reference itself.
 */

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
 * The keys are the ones `components.messages` already uses. They arrive in
 * `messageKeys`, which the message builder returns, so no message key is
 * ever computed twice. A model that the message builder dropped, because
 * another model claimed its key, is not in that map and contributes no
 * entry. That mistake is already reported where the key was claimed.
 *
 * The entries follow the order the operations declare them, and a model that
 * two operations name contributes one entry. Which models reach this channel
 * at all is decided by `channelMessageModels`, which also brings in the reply
 * of an operation that sits on another channel and names this one with
 * `@replyChannel`.
 *
 * An empty result is reported and the field is left out. AsyncAPI makes
 * `messages` optional, so a channel with none stays valid, but a channel
 * with none is almost always a payload model that lost its `@message`. That
 * is the mistake the warning names.
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
