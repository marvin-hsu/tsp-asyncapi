import { DiagnosticTarget, Operation, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { ChannelTarget } from "../channels/state.js";

const replyChannelStateKey = Symbol.for("tsp-asyncapi.replyChannel");
const replyAddressStateKey = Symbol.for("tsp-asyncapi.replyAddress");

/**
 * The address of a reply, as `@replyAddress` recorded it.
 * It is the value type the public reader returns, so it is part of the
 * public surface.
 * @public
 */
export interface ReplyAddressState {
  /**
   * A runtime expression that names where the reply address sits at
   * runtime, such as `$message.header#/replyTo`.
   */
  location: string;
  /** A description of the reply address. CommonMark is allowed. */
  description?: string;
}

/**
 * One `@replyChannel` application.
 * The diagnostic target is kept, because the check that the reply channel
 * exists runs while the document is built. The message has to point at the
 * argument the author wrote, not at the operation.
 */
interface ReplyChannelRecord {
  /** The interface or namespace whose channel answers this operation. */
  channel: ChannelTarget;
  /** Where to report a problem about this application. */
  target: DiagnosticTarget;
}

/**
 * One `@replyAddress` application.
 * The diagnostic target is kept for the same reason. AsyncAPI only allows a
 * reply address on a channel whose address is `null`, and that check needs
 * the built channel set.
 * @internal
 */
export interface ReplyAddressRecord {
  /** The recorded state, which is what reaches the document. */
  state: ReplyAddressState;
  /** Where to report a problem about this application. */
  target: DiagnosticTarget;
}

const [getReplyChannelInternal, setReplyChannel, getReplyChannelStateMap] = useStateMap<
  Operation,
  ReplyChannelRecord
>(replyChannelStateKey);

const [getReplyAddressInternal, setReplyAddress, getReplyAddressStateMap] = useStateMap<
  Operation,
  ReplyAddressRecord
>(replyAddressStateKey);

export { getReplyAddressInternal, getReplyChannelInternal, setReplyAddress, setReplyChannel };

/**
 * Lists every operation that names one target as its reply channel.
 *
 * A channel carries the messages that travel over it. A reply named by
 * `@replyChannel` travels over the named channel, and the operation that
 * declares it sits on another one. So the named channel has to look outside
 * the operations it owns to find that message. This is the lookup that finds
 * them.
 *
 * The order is the order the applications ran, which is not source order. The
 * caller sorts, because the caller knows what it ranks.
 *
 * @param program - The program to read the state from
 * @param channel - The interface or namespace the reply channel sits on
 * @returns The operations that name that target, unordered
 */
export function listOperationsReplyingOver(program: Program, channel: ChannelTarget): Operation[] {
  const operations: Operation[] = [];
  for (const [operation, record] of getReplyChannelStateMap(program)) {
    if (record.channel === channel) operations.push(operation);
  }
  return operations;
}

/**
 * One reply declaration that reached no emitted operation.
 * A reply sits on an operation, so a reply on an operation with no action
 * reaches no part of the document.
 */
export interface StrayReplyRecord {
  /** The operation that carries the reply decorator. */
  operation: Operation;
  /** Where to report a problem about this application. */
  target: DiagnosticTarget;
}

/**
 * Lists every reply declaration the program holds.
 *
 * Both decorators are listed, because either one on its own emits a reply.
 * The caller keeps the ones whose operation carries no action, and reports
 * each of them.
 *
 * @param program - The program to read the state from
 * @returns One entry per application of either reply decorator
 */
export function listReplyDeclarations(program: Program): StrayReplyRecord[] {
  const declared: StrayReplyRecord[] = [];
  for (const [operation, record] of getReplyChannelStateMap(program)) {
    declared.push({ operation, target: record.target });
  }
  for (const [operation, record] of getReplyAddressStateMap(program)) {
    declared.push({ operation, target: record.target });
  }
  return declared;
}
