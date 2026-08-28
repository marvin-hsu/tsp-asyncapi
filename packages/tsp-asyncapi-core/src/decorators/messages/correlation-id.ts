import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { isRuntimeExpression } from "../runtime-expression.js";
import { singleApplication } from "../single-application.js";

const correlationIdStateKey = Symbol.for("tsp-asyncapi.correlationId");

const correlationIdAppliedKey = Symbol.for("tsp-asyncapi.correlationId.applied");
const guard = singleApplication(correlationIdAppliedKey, "duplicate-correlation-id-decorator");

/**
 * State recorded by `@correlationId` for one model.
 * It is the return type of `getCorrelationId`, so it is part of the public
 * surface.
 * @public
 */
export interface CorrelationIdState {
  /** The runtime expression that locates the correlation value. */
  location: string;
  /** The optional prose that describes the correlation id. */
  description?: string;
}

const [getCorrelationIdInternal, setCorrelationId] = useStateMap<Model, CorrelationIdState>(
  correlationIdStateKey,
);

/**
 * Sets the `correlationId` of a message.
 *
 * The emitter checks only the format of `location`, not whether it names a
 * field the headers or payload schema declares. AsyncAPI states no such
 * requirement, and its own examples point at paths their schemas never
 * define.
 *
 * Apply this decorator only once per model, the same rule `@message`
 * follows. A second application leaves no way to tell which location won.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param location - A runtime expression that locates the correlation value,
 * such as `$message.header#/correlationId`
 * @param description - Prose that describes the correlation id
 *
 * @example
 * ```typespec
 * @message
 * @correlationId("$message.header#/correlationId", "Ties a reply to its request.")
 * model OrderCreated {
 *   @header
 *   correlationId: string;
 *
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $correlationId(
  context: DecoratorContext,
  target: Model,
  location: string,
  description?: string,
) {
  // Bottom-up: the last application in source runs first. The guard claims
  // before validation, so a rejected value still blocks a later one.
  if (guard.claim(context, target) !== "first") return;
  if (!isRuntimeExpression(location)) {
    // An expression this emitter cannot parse is one no AsyncAPI tool can
    // follow either, so nothing is recorded.
    reportDiagnostic(context.program, {
      code: "invalid-correlation-id-location",
      target,
      format: { location },
    });
    return;
  }
  // A blank description is dropped: the emitted field would otherwise claim
  // the description is empty rather than absent.
  setCorrelationId(context.program, target, {
    location,
    ...(description ? { description } : {}),
  });
}

/**
 * Reads back the correlation id set by `@correlationId`.
 *
 * @param program - The program to read the state from
 * @param target - The model the decorator was applied to
 * @returns The recorded state, or `undefined` when the decorator was never
 * applied, or when its location was rejected
 *
 * @public
 */
export function getCorrelationId(program: Program, target: Model): CorrelationIdState | undefined {
  // A copy, so a caller cannot mutate emitted state through the returned value.
  const state = getCorrelationIdInternal(program, target);
  return state === undefined ? undefined : { ...state };
}
