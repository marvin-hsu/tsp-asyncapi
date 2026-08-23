import { DecoratorContext, Interface, Namespace, Operation, Program } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import { ChannelTarget } from "../channels/state.js";
import { isRuntimeExpression } from "../runtime-expression.js";
import { singleApplication } from "../single-application.js";
import {
  ReplyAddressState,
  getReplyAddressInternal,
  getReplyChannelInternal,
  setReplyAddress,
  setReplyChannel,
} from "./reply-state.js";

export type { ReplyAddressState } from "./reply-state.js";

const replyChannelGuard = singleApplication(
  Symbol.for("tsp-asyncapi.replyChannel.applied"),
  "duplicate-reply-channel-decorator",
);

const replyAddressGuard = singleApplication(
  Symbol.for("tsp-asyncapi.replyAddress.applied"),
  "duplicate-reply-address-decorator",
);

/**
 * Names the channel the reply of one operation travels over.
 *
 * The argument is the interface or namespace that carries the channel, not
 * the id of that channel. A type reference cannot name a channel that does
 * not exist, and the compiler resolves it. A string would let a typo reach
 * the document as a reference to nothing.
 *
 * An operation with no `@replyChannel` replies over its own channel. So this
 * decorator is only needed for a reply that travels over another channel.
 *
 * The named target must carry `@channel` or `@dynamicChannel`, and that
 * channel must reach the document. The check runs while the document is
 * built, because a channel decorator can still arrive after this one runs. A
 * target with no emitted channel is reported, and the whole `reply` object
 * is dropped.
 *
 * Apply this decorator only once per operation.
 *
 * @param context - The decorator context
 * @param target - The operation whose reply this describes
 * @param channel - The interface or namespace that carries the reply channel
 *
 * @example
 * ```typespec
 * @channel("orders.create")
 * interface OrderChannel {
 *   @send
 *   @replyChannel(ReplyChannel)
 *   op createOrder(command: CreateOrder): OrderAccepted;
 * }
 * ```
 *
 * @public
 */
export function $replyChannel(
  context: DecoratorContext,
  target: Operation,
  channel: Interface | Namespace,
) {
  const channelTarget = context.getArgumentTarget(0) ?? target;
  if (!replyChannelGuard.claim(context, target)) return;
  setReplyChannel(context.program, target, { channel, target: channelTarget });
}

/**
 * Names where the address of a reply sits at runtime.
 *
 * A reply address is for a channel whose address is unknown at design time.
 * The sender puts the address in the message, and the responder reads it
 * from there. `$message.header#/replyTo` is the usual place.
 *
 * The format of `location` is checked while this decorator runs. AsyncAPI
 * allows `$message.header` and `$message.payload` and nothing else, each
 * followed by `#` and an optional JSON Pointer. A location outside that
 * grammar is reported, and the application is dropped. The contents of the
 * pointer are not checked, the same rule `@correlationId` follows.
 *
 * AsyncAPI requires the reply channel to carry `address: null` when a reply
 * address is given. So the reply channel has to be declared with
 * `@dynamicChannel`. That check runs while the document is built, because
 * the channel decorator may not have run yet. A reply address on a channel
 * with an address is reported, and the address is dropped from the reply.
 *
 * Apply this decorator only once per operation.
 *
 * @param context - The decorator context
 * @param target - The operation whose reply this describes
 * @param location - The runtime expression that names the address
 * @param description - A description of the reply address
 *
 * @example
 * ```typespec
 * @send
 * @replyChannel(ReplyChannel)
 * @replyAddress("$message.header#/replyTo")
 * op createOrder(command: CreateOrder): OrderAccepted;
 * ```
 *
 * @public
 */
export function $replyAddress(
  context: DecoratorContext,
  target: Operation,
  location: string,
  description?: string,
) {
  const locationTarget = context.getArgumentTarget(0) ?? target;
  if (!replyAddressGuard.claim(context, target)) return;

  if (!isRuntimeExpression(location)) {
    reportDiagnostic(context.program, {
      code: "invalid-reply-address-location",
      format: { location },
      target: locationTarget,
    });
    return;
  }

  setReplyAddress(context.program, target, {
    state: { location, ...(description ? { description } : {}) },
    target: locationTarget,
  });
}

/**
 * Reads back the reply channel named on one operation.
 *
 * @param program - The program to read the state from
 * @param target - The operation the decorator was applied to
 * @returns The interface or namespace that carries the reply channel, or
 * `undefined` when the decorator was never applied
 *
 * @public
 */
export function getReplyChannel(program: Program, target: Operation): ChannelTarget | undefined {
  return getReplyChannelInternal(program, target)?.channel;
}

/**
 * Reads back the reply address declared on one operation.
 *
 * @param program - The program to read the state from
 * @param target - The operation the decorator was applied to
 * @returns A copy of the recorded state, or `undefined` when the decorator
 * was never applied, and when the application was dropped
 *
 * @public
 */
export function getReplyAddress(
  program: Program,
  target: Operation,
): ReplyAddressState | undefined {
  const record = getReplyAddressInternal(program, target);
  return record === undefined ? undefined : { ...record.state };
}
