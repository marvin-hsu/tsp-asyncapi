import { Model } from "@typespec/compiler";
import { ReferenceObject } from "../../types.js";
import { EmittedChannel } from "../channels/builder.js";
import { channelMessageRef } from "../json-pointer.js";

/**
 * Builds the message references of one side of an operation.
 *
 * Every reference addresses the `messages` map of a channel. The pointer
 * itself is built by `channelMessageRef`, which states why it goes through
 * the channel.
 *
 * A model that no emitted message describes contributes nothing and is not
 * reported. Such a model is a payload or a channel parameter, not a message.
 * A model whose key another message claimed contributes nothing either, and
 * that mistake is already reported where the key was claimed. A model the
 * channel does not carry is dropped for the same reason: the only way one
 * reaches this point is a key another message took.
 *
 * Nothing is deduplicated here. The two collections upstream already decide
 * it, and each entry of this list is one key of the channel. One side of a
 * signature holds each model once, and a channel gives each model it carries
 * its own key. So no two entries can address one key.
 *
 * An empty result leaves the field out. AsyncAPI reads an operation with no
 * `messages` as "every message of the channel". An empty array would say the
 * opposite, because it requires every message to match one entry of a list
 * with no entry in it.
 *
 * @param models - The models of this side of the signature, in source order
 * @param channel - The channel these references point into
 * @param messageKeys - The key each emitted message model was given
 * @returns The references, in signature order, or `undefined` when none
 * survives
 */
export function buildMessageReferences(
  models: readonly Model[],
  channel: EmittedChannel,
  messageKeys: ReadonlyMap<Model, string>,
): ReferenceObject[] | undefined {
  const references: ReferenceObject[] = [];

  for (const model of models) {
    // A model that describes no emitted message is not a message at all.
    if (!messageKeys.has(model)) continue;
    const key = channel.messageKeys.get(model);
    if (key === undefined) continue;
    references.push({ $ref: channelMessageRef(channel.id, key) });
  }

  return references.length > 0 ? references : undefined;
}
