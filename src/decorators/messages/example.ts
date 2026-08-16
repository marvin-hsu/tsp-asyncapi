import {
  compilerAssert,
  DecoratorContext,
  Model,
  ObjectValue,
  Program,
  Value,
} from "@typespec/compiler";
import { AugmentDecoratorStatementNode, DecoratorExpressionNode } from "@typespec/compiler/ast";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";

const messageExampleStateKey = Symbol.for("tsp-asyncapi.messageExample");

/**
 * The metadata argument of `@messageExample`.
 * The field names come from the AsyncAPI Message Example Object. AsyncAPI
 * calls them `name` and `summary`, where OpenAPI would call them `title` and
 * `description`.
 * @public
 */
export interface MessageExampleOptions {
  /** A machine-friendly name for this example. */
  name?: string;
  /** A short summary of what this example shows. */
  summary?: string;
}

/**
 * One example recorded by `@messageExample`.
 * It is the element type of the array `getMessageExamples` returns, so it is
 * part of the public surface.
 *
 * `headers` and `payload` hold the raw TypeSpec value, not a marshalled JS
 * object. The raw value keeps the type of every scalar it contains, so the
 * emitter can serialize a `utcDateTime` to its ISO form rather than emit the
 * compiler's internal value object. This follows the compiler's own
 * `@example` and `@opExample`, which record the raw value for the same
 * reason.
 * @public
 */
export interface MessageExampleState extends MessageExampleOptions {
  /** The example headers, when the application gave any. */
  headers?: Value;
  /** The example payload, when the application gave any. */
  payload?: Value;
  /**
   * The source node of this application.
   * The recorded list is in the order the applications ran, and that is not
   * source order. The node carries the position the emitter sorts by.
   */
  node: DecoratorExpressionNode | AugmentDecoratorStatementNode;
}

const [getMessageExamplesInternal, setMessageExamples] = useStateMap<Model, MessageExampleState[]>(
  messageExampleStateKey,
);

/**
 * Adds one example to a message.
 *
 * This decorator is repeatable. Each application appends its own example
 * rather than replacing a prior one. AsyncAPI's `examples` is an array, and
 * one message often shows several situations, each with its own `name`. The
 * emitted array follows source order.
 *
 * Every example carries at least one of `headers` and `payload`. An example
 * with neither says nothing about the message, so it is reported and
 * dropped.
 *
 * The example content is not checked against the message schema. The value
 * is emitted as written.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param example - The example content: `headers`, `payload`, or both
 * @param options - The `name` and `summary` of this example
 *
 * @example
 * ```typespec
 * @message
 * @messageExample(#{ payload: #{ orderId: "1" } }, #{ name: "minimal" })
 * @messageExample(
 *   #{ headers: #{ correlationId: "abc" }, payload: #{ orderId: "2" } },
 *   #{ name: "correlated", summary: "A reply to an earlier request." }
 * )
 * model OrderCreated {
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $messageExample(
  context: DecoratorContext,
  target: Model,
  _example: unknown,
  options?: MessageExampleOptions,
) {
  // The marshalled `_example` argument is not used. Marshalling turns a
  // value into plain JS, which loses the type of every scalar inside it. A
  // `utcDateTime` would then reach the document as the compiler's own value
  // object rather than as an ISO string. So the raw value is read back off
  // the decorator application instead, the way the compiler's `@example` and
  // `@opExample` read theirs.
  // `decoratorTarget` is the source node of the application that is running.
  // Its static type is the wider `DiagnosticTarget`, so it is narrowed here
  // to compare against the node each application records.
  const node = context.decoratorTarget as DecoratorExpressionNode | AugmentDecoratorStatementNode;
  const application = target.decorators.find(
    (d) => d.decorator === $messageExample && d.node === node,
  );
  compilerAssert(application, `Couldn't find @messageExample decorator`, context.decoratorTarget);
  const raw = application.args[0]?.value as ObjectValue | undefined;
  const headers = raw?.properties.get("headers")?.value;
  const payload = raw?.properties.get("payload")?.value;

  if (headers === undefined && payload === undefined) {
    // The diagnostic points at this application, not at the model. One model
    // can carry several applications, and only the model tells the user
    // nothing about which of them was rejected.
    reportDiagnostic(context.program, { code: "empty-message-example", target: node });
    return;
  }

  const examples = getMessageExamplesInternal(context.program, target) ?? [];
  // An empty prose field is dropped rather than recorded. A blank name names
  // nothing and a blank summary summarises nothing. The emitted field would
  // claim the example carries one rather than none.
  examples.push({
    node,
    ...(options?.name ? { name: options.name } : {}),
    ...(options?.summary ? { summary: options.summary } : {}),
    ...(headers !== undefined ? { headers } : {}),
    ...(payload !== undefined ? { payload } : {}),
  });
  setMessageExamples(context.program, target, examples);
}

/**
 * Reads back every example that `@messageExample` records for one model.
 * The list is in the order the applications ran, which is not source order.
 * The emitter sorts it before it emits the `examples` array.
 *
 * @param program - The program to read the state from
 * @param target - The model the decorator was applied to
 * @returns The recorded examples. The array is empty when the decorator was
 * never applied.
 *
 * @public
 */
export function getMessageExamples(program: Program, target: Model): MessageExampleState[] {
  return getMessageExamplesInternal(program, target) ?? [];
}
