/**
 * The `@channel` and `@dynamicChannel` decorators, and the readers other
 * modules use to see what they recorded.
 *
 * Both decorators share `recordChannel` for everything after the address is
 * settled. The claim and conflict rules live in `state.js`, and the address
 * grammar lives in `address-template.js`, so this module wires the two
 * together and turns their findings into diagnostics.
 */
import { DecoratorContext, DiagnosticTarget, Program } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { sourcePositionOf } from "../../source-order.js";
import { resolveExplicitId } from "../explicit-id.js";
import { checkAddress } from "./address-template.js";
import {
  ChannelRecord,
  ChannelState,
  ChannelTarget,
  claimChannel,
  getChannelInternal,
  listChannelsInternal,
  setChannel,
} from "./state.js";

export type { ChannelState } from "./state.js";

/**
 * Records one channel on a target.
 * The two decorators differ only in the address they carry, so they share
 * everything that happens after the address is settled.
 */
function recordChannel(
  context: DecoratorContext,
  target: ChannelTarget,
  state: ChannelState,
  addressTarget: DiagnosticTarget,
): void {
  const record: ChannelRecord = {
    state,
    ...sourcePositionOf(context.decoratorTarget),
    addressTarget,
  };
  setChannel(context.program, target, record);
}

/**
 * Declares one channel on an interface or a namespace.
 *
 * The channel owns the operations declared directly inside that interface or
 * namespace. A nested interface, and a namespace nested inside a namespace,
 * are separate scopes. Each of them may carry a channel of its own, and none
 * of their operations reaches this channel.
 *
 * The address is checked while this decorator runs, so a problem is reported
 * at the place the address was written. A query string and a fragment are
 * both rejected, because AsyncAPI states that a channel binding expresses
 * them instead. Braces must pair up, and the name between them must be one a
 * TypeSpec property could carry. The scheme and the host are not checked at
 * all: a full URL, a bare path, and a plain topic name are all legal.
 *
 * The address is stored trimmed, and the trimmed text is what is emitted.
 * An address that fails a check drops the channel.
 *
 * Apply this decorator only once per target, and never together with
 * `@dynamicChannel`. Both mistakes are reported.
 *
 * @param context - The decorator context
 * @param target - The interface or namespace this channel describes
 * @param address - The address of the channel, such as `orders.created`. It
 * may hold `{name}` expressions, and an operation of the channel then
 * declares each name as a parameter.
 * @param channelId - Overrides the key of this channel in the emitted
 * `channels` map. Without it, the key is the address itself.
 *
 * @example
 * ```typespec
 * @channel("orders.{orderId}.created")
 * interface OrderChannel {
 *   publish(orderId: string, event: OrderCreated): void;
 * }
 * ```
 *
 * @public
 */
export function $channel(
  context: DecoratorContext,
  target: ChannelTarget,
  address: string,
  channelId?: string,
) {
  // Both address problems point at the address argument, the same way
  // `@server` points at its name argument.
  const addressTarget = context.getArgumentTarget(0) ?? target;
  const idTarget = context.getArgumentTarget(1) ?? target;

  if (!claimChannel(context, target, "channel")) return;

  const id = resolveExplicitId(context, channelId, idTarget, "empty-channel-id");
  if (id === null) return;

  const trimmed = address.trim();
  const problem = checkAddress(trimmed);
  if (problem !== undefined) {
    // The channel is dropped, the same way `@server` drops a server whose
    // name or required field is unusable.
    if (problem.code === "invalid-channel-address") {
      reportDiagnostic(context.program, {
        code: problem.code,
        messageId: problem.messageId,
        format: { address: trimmed },
        target: addressTarget,
      });
    } else if (problem.code === "invalid-channel-param-name") {
      reportDiagnostic(context.program, {
        code: problem.code,
        format: { name: problem.name },
        target: addressTarget,
      });
    } else {
      reportDiagnostic(context.program, { code: problem.code, target: addressTarget });
    }
    return;
  }

  recordChannel(
    context,
    target,
    { address: trimmed, ...(id ? { channelId: id } : {}) },
    addressTarget,
  );
}

/**
 * Declares one channel whose address is only known at runtime.
 *
 * The emitted channel carries the literal `address: null`. AsyncAPI reads
 * that as "unknown", which is what an address generated at runtime needs.
 *
 * This is a separate decorator rather than a `@channel` with the address
 * left out. A channel with an unknown address is a different kind of
 * channel, not a channel that forgot its address, and the two must stay
 * distinguishable. So `@channel` keeps its required address.
 *
 * The scope rule is the one `@channel` follows: the channel owns the
 * operations declared directly inside the target, and nothing nested inside
 * it. A channel with an unknown address takes no parameters, because it
 * carries no address to put an expression in.
 *
 * Apply this decorator only once per target, and never together with
 * `@channel`. Both mistakes are reported.
 *
 * @param context - The decorator context
 * @param target - The interface or namespace this channel describes
 * @param channelId - Overrides the key of this channel in the emitted
 * `channels` map. Without it, the key is the declaration name of the target.
 *
 * @example
 * ```typespec
 * @dynamicChannel
 * interface ReplyChannel {
 *   receive(response: OrderAccepted): void;
 * }
 * ```
 *
 * @public
 */
export function $dynamicChannel(
  context: DecoratorContext,
  target: ChannelTarget,
  channelId?: string,
) {
  const idTarget = context.getArgumentTarget(0) ?? target;

  if (!claimChannel(context, target, "dynamic")) return;

  const id = resolveExplicitId(context, channelId, idTarget, "empty-channel-id");
  if (id === null) return;

  recordChannel(context, target, { address: null, ...(id ? { channelId: id } : {}) }, target);
}

/**
 * Reads back the channel declared on one interface or namespace.
 *
 * @param program - The program to read the state from
 * @param target - The interface or namespace the decorator was applied to
 * @returns A copy of the recorded state, or `undefined` when neither channel
 * decorator was applied, and when the declaration was dropped
 *
 * @public
 */
export function getChannel(program: Program, target: ChannelTarget): ChannelState | undefined {
  const record = getChannelInternal(program, target);
  return record === undefined ? undefined : { ...record.state };
}

/**
 * Lists every channel the program declares, in source order.
 *
 * @param program - The program to read the state from
 * @returns A map from each interface or namespace that carries a channel to
 * the recorded state. The map keeps source order.
 *
 * @public
 */
export function listChannels(program: Program): Map<ChannelTarget, ChannelState> {
  const channels = new Map<ChannelTarget, ChannelState>();
  for (const { target, record } of listChannelsInternal(program)) {
    channels.set(target, { ...record.state });
  }
  return channels;
}
