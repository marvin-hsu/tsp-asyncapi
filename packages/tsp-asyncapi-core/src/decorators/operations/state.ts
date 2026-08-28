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
 *
 * The two decorators guard themselves the way every other decorator here
 * does. They also have to see each other, because `@send` and `@receive`
 * state opposite directions on one operation. So each guard is asked whether
 * the other one already ran.
 */
const actionGuards: Record<OperationAction, ApplicationGuard> = {
  send: singleApplication(Symbol.for("tsp-asyncapi.send.applied"), "duplicate-send-decorator"),
  receive: singleApplication(
    Symbol.for("tsp-asyncapi.receive.applied"),
    "duplicate-receive-decorator",
  ),
};

/**
 * Records that one of the two action decorators ran on an operation, and
 * tells the caller whether it may proceed.
 *
 * Two mistakes end here. The same decorator applied twice keeps one action
 * and one id, and the author cannot tell which. The two different decorators
 * applied together state that this application sends the message and that it
 * receives one, and nothing picks a winner. So the first is reported per
 * decorator, and the second drops the operation outright.
 *
 * Each decorator keeps its own guard, so the guard answers "did this
 * decorator run" and not "did any action decorator run". The two mistakes
 * are two questions, and one flag cannot answer both. An operation that
 * carries `@send` twice and `@receive` once has to hear about the duplicate
 * and about the conflict.
 *
 * The claim runs before the id is validated, because `singleApplication`
 * records the application before the caller validates anything. An
 * application whose id is rejected still blocks a later one.
 *
 * @param context - The decorator context
 * @param target - The operation the decorator was applied to
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
    // Both decorators reached this operation. The one that ran first may
    // have recorded an action already, so that record is taken back out.
    // Neither declaration can be shown to win, so the operation gets no
    // action at all. This decorator claimed first, so a third application of
    // either decorator is still reported as the duplicate it is.
    getActionStateMap(context.program).delete(target);
    reportDiagnostic(context.program, { code: "conflicting-operation-actions", target });
    return false;
  }
  return true;
}

/**
 * Lists every operation the program marks with an action, in source order.
 *
 * The order is global, not per channel. The operation keys clash across the
 * whole document, so "the first one in source order keeps the key" has to
 * mean one thing for the whole program.
 *
 * @param program - The program to read the state from
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
