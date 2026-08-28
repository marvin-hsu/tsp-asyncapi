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
 * object, so the emitter can serialize a `utcDateTime` to its ISO form
 * rather than emit the compiler's internal value object. This follows the
 * compiler's own `@example` and `@opExample`, which record the raw value
 * for the same reason.
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
 * This decorator is repeatable: each application appends its own example
 * rather than replacing a prior one, matching AsyncAPI's `examples` array.
 * The emitted array follows source order.
 *
 * An example needs at least one of `headers` and `payload`; one with
 * neither says nothing about the message, so it is reported and dropped.
 * The content is not checked against the message schema and is emitted as
 * written.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param _example - The example content. The marshalled value is unused.
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
  // The marshalled `_example` argument is unused: marshalling loses the type
  // of every scalar it contains, so a `utcDateTime` would reach the document
  // as the compiler's value object rather than an ISO string. The raw value
  // is read back off the decorator application instead, matching how the
  // compiler's `@example` and `@opExample` read theirs.
  // `decoratorTarget`'s static type is the wider `DiagnosticTarget`, so it is
  // narrowed here to compare against the node each application records.
  const node = context.decoratorTarget as DecoratorExpressionNode | AugmentDecoratorStatementNode;
  const application = target.decorators.find(
    (d) => d.decorator === $messageExample && d.node === node,
  );
  compilerAssert(application, `Couldn't find @messageExample decorator`, context.decoratorTarget);
  const raw = application.args[0]?.value as ObjectValue | undefined;
  const headers = raw?.properties.get("headers")?.value;
  const payload = raw?.properties.get("payload")?.value;

  if (headers === undefined && payload === undefined) {
    // Points at this application, not the model: a model can carry several
    // applications, and the model alone would not say which was rejected.
    reportDiagnostic(context.program, { code: "empty-message-example", target: node });
    return;
  }

  const examples = getMessageExamplesInternal(context.program, target) ?? [];
  // A blank `name` or `summary` is dropped rather than recorded, since the
  // emitted field would otherwise claim the example carries one.
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
 * The list is in the order the applications ran, which is not source order;
 * the emitter sorts it before it emits the `examples` array.
 *
 * @param program - The program to read the state from
 * @param target - The model the decorator was applied to
 * @returns A copy of the recorded examples. The array is empty when the
 * decorator was never applied. The example values themselves are compiler
 * values, which are shared rather than copied.
 *
 * @public
 */
export function getMessageExamples(program: Program, target: Model): MessageExampleState[] {
  // A copy, so a caller cannot mutate emitted state through the returned value.
  return (getMessageExamplesInternal(program, target) ?? []).map((example) => ({ ...example }));
}
