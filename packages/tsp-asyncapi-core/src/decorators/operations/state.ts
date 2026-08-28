import { DecoratorContext, Operation, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { SourcePosition, bySourcePosition } from "../../source-order.js";
import { ApplicationGuard, singleApplication } from "../single-application.js";

const actionStateKey = Symbol.for("tsp-asyncapi.operationAction");

/**
 * The direction of one operation, from the point of view of this
 * application. AsyncAPI 3 allows these two values and no other.
 * @public
 */
export type OperationAction = "send" | "receive";

/**
 * State recorded by `@send` and `@receive` for one operation.
 * It is the value type of the map `listOperationActions` returns, so it is
 * part of the public surface.
 * @public
 */
export interface OperationActionState {
  /** The emitted `action` value. It is the name of the decorator. */
  action: OperationAction;
  /**
   * The explicit `operations` key given as the decorator argument.
   * It is `undefined` when the decorator was applied without one, and the
   * key then comes from the declaration name of the operation.
   */
  operationId?: string;
}

/** One action declaration, with the source position it was written at. */
interface OperationActionEntry extends SourcePosition {
  record: OperationActionState;
}

const [getActionInternal, setAction, getActionStateMap] = useStateMap<
  Operation,
  OperationActionEntry
>(actionStateKey);

export { getActionInternal, setAction };

/**
 * The single-application guard of each action decorator.
 * They also see each other, since `@send` and `@receive` state opposite
 * directions on one operation. Each guard checks whether the other one
 * already ran.
 */
const actionGuards: Record<OperationAction, ApplicationGuard> = {
  send: singleApplication(Symbol.for("tsp-asyncapi.send.applied"), "duplicate-send-decorator"),
  receive: singleApplication(
    Symbol.for("tsp-asyncapi.receive.applied"),
    "duplicate-receive-decorator",
  ),
};

/**
 * Records that one of the two action decorators ran, and tells the caller
 * whether it may proceed.
 *
 * Two mistakes end here: the same decorator applied twice, and both
 * decorators applied to one operation. The first is reported once per
 * decorator. The second drops the operation's action outright, since
 * neither declaration can be shown to win.
 *
 * Each decorator keeps its own guard, so an operation with two `@send` and
 * one `@receive` is told about both the duplicate and the conflict.
 *
 * The claim runs before the id is validated, since `singleApplication`
 * records the application first. An application whose id gets rejected
 * still blocks a later one.
 *
 * @param action - Which of the two decorators is running
 * @returns True when the caller may record its action
 */
export function claimAction(
  context: DecoratorContext,
  target: Operation,
  action: OperationAction,
): boolean {
  const other = actionGuards[action === "send" ? "receive" : "send"];
  const otherApplied = other.isApplied(context.program, target);
  if (actionGuards[action].claim(context, target) !== "first") return false;
  if (otherApplied) {
    // Neither declaration wins, so drop any action already recorded. This
    // decorator claimed first, so a further application of either one is
    // still reported as a duplicate.
    getActionStateMap(context.program).delete(target);
    reportDiagnostic(context.program, { code: "conflicting-operation-actions", target });
    return false;
  }
  return true;
}

/**
 * Lists every operation the program marks with an action, in source order.
 *
 * The order is global, not per channel, since operation keys can clash
 * across the whole document.
 *
 * @returns The marked operations, each with its record, in source order
 */
export function listOperationActions(
  program: Program,
): { target: Operation; record: OperationActionState }[] {
  const declared: { target: Operation; entry: OperationActionEntry }[] = [];
  for (const [target, entry] of getActionStateMap(program)) {
    declared.push({ target, entry });
  }
  const compare = bySourcePosition(program);
  declared.sort((a, b) => compare(a.entry, b.entry));
  return declared.map(({ target, entry }) => ({ target, record: entry.record }));
}
