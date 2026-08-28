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
 * The target is kept so the existence check, which runs while the document
 * is built, can point at the argument the author wrote, not the operation.
 */
interface ReplyChannelRecord {
  /** The interface or namespace whose channel answers this operation. */
  channel: ChannelTarget;
  /** Where to report a problem about this application. */
  target: DiagnosticTarget;
}

/**
 * One `@replyAddress` application.
 * AsyncAPI allows a reply address only on a channel with a `null` address.
 * The target is kept because that check needs the built channel set.
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
 * Lists every operation whose reply travels over `channel`.
 *
 * A reply named by `@replyChannel` travels over another channel than the one
 * its operation declares. So that channel has to look outside its own
 * operations to find these replies.
 *
 * The result order is application order, not source order. Sort it if the
 * caller needs a specific order.
 *
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
 * A reply on an operation with no action reaches no part of the document.
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
 * The caller keeps the ones whose operation carries no action and reports
 * each of them.
 *
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
