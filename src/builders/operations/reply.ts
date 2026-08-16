import { Model, Operation, Program } from "@typespec/compiler";
import { ChannelTarget } from "../../decorators/channels/state.js";
import {
  getReplyAddressInternal,
  getReplyChannelInternal,
} from "../../decorators/operations/reply-state.js";
import { reportDiagnostic } from "../../lib.js";
import { OperationReplyObject } from "../../types/index.js";
import { EmittedChannel } from "../channels/builder.js";
import { channelRef } from "../json-pointer.js";
import { present } from "../../optional-fields.js";
import { buildMessageReferences } from "./messages.js";

/** Everything the reply builder needs about one operation. */
export interface ReplyContext {
  /** The operation the reply belongs to. */
  operation: Operation;
  /** The channel the operation itself runs over. */
  ownChannel: EmittedChannel;
  /** The channel each target contributed, for the reply channel lookup. */
  channels: ReadonlyMap<ChannelTarget, EmittedChannel>;
  /** The models of the reply side of the signature, in source order. */
  replyModels: readonly Model[];
  /** The models of the request side of the signature, in source order. */
  requestModels: readonly Model[];
  /** The key each emitted message model was given. */
  messageKeys: ReadonlyMap<Model, string>;
}

/**
 * Builds the `reply` object of one operation.
 *
 * A reply is emitted in two cases. The first is an explicit one: the
 * operation carries `@replyChannel` or `@replyAddress`. The second is a
 * signature that describes a request and a reply on its own. That happens
 * when both sides of the signature name a message of the channel.
 *
 * `channel` is always emitted. AsyncAPI makes it optional, and leaving it
 * out would make two of its own rules uncheckable. The subset rule for
 * `reply.messages` needs a channel, and so does the rule that a reply
 * address only sits on a channel with no address.
 *
 * @param program - The program to report on
 * @param context - What this operation contributes to its reply
 * @returns The reply object, or `undefined` when this operation has none
 */
export function buildOperationReply(
  program: Program,
  context: ReplyContext,
): OperationReplyObject | undefined {
  const { operation, ownChannel, channels, replyModels, requestModels, messageKeys } = context;
  const declaredChannel = getReplyChannelInternal(program, operation);
  const declaredAddress = getReplyAddressInternal(program, operation);

  const declared = declaredChannel !== undefined || declaredAddress !== undefined;
  const bothSidesCarryMessages =
    hasChannelMessage(requestModels, ownChannel) && hasChannelMessage(replyModels, ownChannel);
  if (!declared && !bothSidesCarryMessages) return undefined;

  let replyChannel = ownChannel;
  if (declaredChannel !== undefined) {
    const named = channels.get(declaredChannel.channel);
    if (named === undefined) {
      // The whole reply goes, not just the channel. A reply whose channel is
      // unknown carries neither a checkable message list nor a checkable
      // address, so a partial one would say something the author never wrote.
      reportDiagnostic(program, {
        code: "reply-channel-not-a-channel",
        format: { name: declaredChannel.channel.name },
        target: declaredChannel.target,
      });
      return undefined;
    }
    replyChannel = named;
  }

  // AsyncAPI requires every entry of `reply.messages` to be a message of the
  // reply channel. The rule holds by construction here. A reply travels over
  // the channel it names, so the channel collection puts every reply message
  // on that channel before this runs.
  const messages = buildMessageReferences(replyModels, replyChannel, messageKeys);

  return {
    ...present("address", buildReplyAddress(program, replyChannel, declaredAddress)),
    channel: { $ref: channelRef(replyChannel.id) },
    ...present("messages", messages),
  };
}

/**
 * Builds the `address` of one reply, and enforces the rule AsyncAPI puts on
 * it.
 *
 * A reply address only belongs on a channel whose address is `null`. The
 * reply address is what the address of that channel is at runtime, so a
 * channel that already carries one would state two addresses. That is what
 * `@dynamicChannel` exists for, and the message names it as the fix.
 *
 * The check cannot run inside `@replyAddress`. The `@channel` on the reply
 * target may not have run yet when it does.
 *
 * The address is dropped and the rest of the reply survives. A reply over a
 * static channel is still a valid document.
 */
function buildReplyAddress(
  program: Program,
  replyChannel: EmittedChannel,
  declaredAddress: ReturnType<typeof getReplyAddressInternal>,
): OperationReplyObject["address"] {
  if (declaredAddress === undefined) return undefined;
  if (replyChannel.address !== null) {
    reportDiagnostic(program, {
      code: "reply-address-needs-dynamic-channel",
      format: { id: replyChannel.id },
      target: declaredAddress.target,
    });
    return undefined;
  }
  return { ...declaredAddress.state };
}

/** True when at least one of the models is a message of the channel. */
function hasChannelMessage(models: readonly Model[], channel: EmittedChannel): boolean {
  return models.some((model) => channel.messageKeys.has(model));
}
