import { Model, Program } from "@typespec/compiler";
import { ChannelTarget } from "../../decorators/channels/state.js";
import { reportDiagnostic } from "../../lib.js";
import { ReferenceObject } from "../../types/index.js";
import { toJsonPointerToken } from "../json-pointer.js";
import { channelOperations, operationModels } from "./scope.js";

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
 * two operations name contributes one entry.
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
 * @returns The `messages` map, or `undefined` when the channel names none
 */
export function buildChannelMessages(
  program: Program,
  target: ChannelTarget,
  channelId: string,
  messageKeys: ReadonlyMap<Model, string>,
): Record<string, ReferenceObject> | undefined {
  const entries: [string, ReferenceObject][] = [];
  const claimed = new Set<string>();

  for (const operation of channelOperations(program, target)) {
    for (const model of operationModels(program, operation)) {
      const key = messageKeys.get(model);
      if (key === undefined || claimed.has(key)) continue;
      claimed.add(key);
      entries.push([key, { $ref: `#/components/messages/${toJsonPointerToken(key)}` }]);
    }
  }

  if (entries.length === 0) {
    reportDiagnostic(program, {
      code: "channel-no-messages",
      format: { id: channelId },
      target,
    });
    return undefined;
  }

  // The map is built from entries, so a key such as `__proto__` becomes an
  // own property instead of a write to the prototype. This matches the way
  // every other map in this emitter is built.
  return Object.fromEntries(entries);
}
