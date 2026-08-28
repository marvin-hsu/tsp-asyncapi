import { DecoratorContext, Operation, Program } from "@typespec/compiler";
import { sourcePositionOf } from "../../source-order.js";
import { resolveExplicitId } from "../explicit-id.js";
import {
  OperationAction,
  OperationActionState,
  claimAction,
  getActionInternal,
  setAction,
} from "./state.js";

export type { OperationAction, OperationActionState } from "./state.js";

/**
 * Records one action on an operation.
 * The two decorators differ only in the action they carry, so they share
 * everything else.
 */
function recordAction(
  context: DecoratorContext,
  target: Operation,
  action: OperationAction,
  operationId: string | undefined,
): void {
  setAction(context.program, target, {
    record: { action, ...(operationId ? { operationId } : {}) },
    ...sourcePositionOf(context.decoratorTarget),
  });
}

/**
 * Marks one operation as a message this application sends.
 *
 * The emitted operation carries `action: "send"`. AsyncAPI 3 reads the
 * action from the point of view of this application, so `send` means this
 * application produces the message.
 *
 * The operation points at the channel of the interface or namespace that
 * holds it. An interface wins over the namespace around it, because a nested
 * interface is a channel scope of its own. An operation whose scope carries
 * no emitted channel is reported and dropped.
 *
 * The parameter types name the messages this operation sends. The return
 * type names the messages of its reply.
 *
 * Apply this decorator only once per operation, and never together with
 * `@receive`. Both mistakes are reported.
 *
 * @param operationId - Overrides the key of this operation in the emitted
 * `operations` map. Without it, the key is the name of the operation.
 *
 * @example
 * ```typespec
 * @channel("orders.created")
 * interface OrderChannel {
 *   @send op sendOrderCreated(event: OrderCreated): void;
 * }
 * ```
 *
 * @public
 */
export function $send(context: DecoratorContext, target: Operation, operationId?: string) {
  applyAction(context, target, "send", operationId);
}

/**
 * Marks one operation as a message this application receives.
 *
 * The emitted operation carries `action: "receive"`. AsyncAPI 3 reads the
 * action from the point of view of this application, so `receive` means this
 * application consumes the message.
 *
 * The channel rule is the one `@send` follows. The direction of the
 * signature is the inverse: the return type names the messages this
 * operation receives, and the parameter types name the messages of its
 * reply.
 *
 * Apply this decorator only once per operation, and never together with
 * `@send`. Both mistakes are reported.
 *
 * @param operationId - Overrides the key of this operation in the emitted
 * `operations` map. Without it, the key is the name of the operation.
 *
 * @example
 * ```typespec
 * @channel("orders.created")
 * interface OrderChannel {
 *   @receive op onOrderCreated(): OrderCreated;
 * }
 * ```
 *
 * @public
 */
export function $receive(context: DecoratorContext, target: Operation, operationId?: string) {
  applyAction(context, target, "receive", operationId);
}

/** The body both action decorators share. */
function applyAction(
  context: DecoratorContext,
  target: Operation,
  action: OperationAction,
  operationId: string | undefined,
): void {
  const idTarget = context.getArgumentTarget(0) ?? target;

  if (!claimAction(context, target, action)) return;

  const id = resolveExplicitId(context, operationId, idTarget, "empty-operation-id");
  if (id === null) return;

  recordAction(context, target, action, id);
}

/**
 * Reads back the action declared on one operation.
 *
 * @returns A copy of the recorded state, or `undefined` when neither action
 * decorator was applied, and when the declaration was dropped
 *
 * @public
 */
export function getOperationAction(
  program: Program,
  target: Operation,
): OperationActionState | undefined {
  const entry = getActionInternal(program, target);
  return entry === undefined ? undefined : { ...entry.record };
}
