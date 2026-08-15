import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";

const messageStateKey = Symbol.for("tsp-asyncapi.message");

/**
 * State recorded by `@message` for one model.
 * It is the value type of the map `listMessages` returns, so it is part of
 * the public surface.
 * @public
 */
export interface MessageState {
  /**
   * The explicit `components.messages` key given as the decorator argument.
   * It is `undefined` when the decorator was applied with no argument.
   */
  name?: string;
}

const [getMessageState, setMessage, getMessageStateMap] = useStateMap<Model, MessageState>(
  messageStateKey,
);

/**
 * Marks a model as an AsyncAPI message.
 * The model itself is the message payload. The emitter emits one
 * `components.messages` entry for each marked model. It also emits the
 * payload model, and every model the payload reaches, into
 * `components.schemas`.
 *
 * The target is a `Model` only. A message whose payload is a bare scalar
 * must wrap that scalar in a model. This keeps one shape for every message
 * payload.
 *
 * @param context - The decorator context
 * @param target - The model to mark as a message
 * @param name - Overrides the `components.messages` key. Without it, the
 * key comes from the model's own name. A `components.messages` key drops the
 * namespace prefix that a `components.schemas` key keeps. So an explicit
 * name that spells a qualified schema key, such as `"Sales.Ev"`, can look
 * like it describes that schema while it describes this model. The emitter
 * reports `message-key-shadows-schema-key` for that overlap.
 *
 * Apply this decorator only once per model. A second application is an
 * error. Only one of the applied names could ever reach the output, and the
 * user has no way to tell which one won.
 *
 * @example
 * ```typespec
 * @message
 * model OrderCreated { id: string; }
 *
 * @message("order-cancelled")
 * model OrderCancelled { id: string; }
 * ```
 *
 * @public
 */
export function $message(context: DecoratorContext, target: Model, name?: string) {
  // The decorators on one declaration run bottom-up. So the first
  // application to reach this function is the one written last in the
  // source. It keeps the model, and every later application is rejected.
  // This gives one deterministic winner instead of a silent overwrite.
  if (getMessageState(context.program, target) !== undefined) {
    reportDiagnostic(context.program, {
      code: "duplicate-message-decorator",
      target,
    });
    return;
  }
  setMessage(context.program, target, { name });
}

/**
 * Lists every model that `@message` marks, in the order the decorator ran.
 * The emitter drives both `components.messages` and the schema collection
 * from this list.
 *
 * @param program - The program to read the state from
 * @returns A map from each marked model to its recorded state
 *
 * @public
 */
export function listMessages(program: Program): Map<Model, MessageState> {
  return getMessageStateMap(program);
}
