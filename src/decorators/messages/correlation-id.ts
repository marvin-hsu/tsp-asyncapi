import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { isRuntimeExpression } from "../runtime-expression.js";
import { singleApplication } from "../single-application.js";

const correlationIdStateKey = Symbol.for("tsp-asyncapi.correlationId");

const correlationIdAppliedKey = Symbol.for("tsp-asyncapi.correlationId.applied");
const claim = singleApplication(correlationIdAppliedKey, "duplicate-correlation-id-decorator");

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
 * The emitter checks the format of `location` and nothing else. It does not
 * check that the pointer names a field that the headers or payload schema
 * declares. AsyncAPI states no such requirement, and its own examples point
 * at paths their schemas never define. A check would reject documents the
 * specification allows.
 *
 * Apply this decorator only once per model. A second application is an
 * error, the same rule `@message` follows. Only one of the applied locations
 * could ever reach the output, and the user has no way to tell which one
 * won.
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
  // Decorators on one declaration run bottom-up, so the application
  // written last in the source runs first and wins. The guard records
  // that this decorator ran, before any value is validated, so a value
  // that fails validation still blocks a later application.
  if (!claim(context, target)) return;
  if (!isRuntimeExpression(location)) {
    // Nothing is recorded, so no `correlationId` reaches the document. An
    // expression this emitter cannot parse is one no AsyncAPI tool can
    // follow either.
    reportDiagnostic(context.program, {
      code: "invalid-correlation-id-location",
      target,
      format: { location },
    });
    return;
  }
  // An empty description is dropped rather than recorded. A blank description
  // says nothing about the correlation id. The emitted field would claim the
  // description is empty rather than absent.
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
  return getCorrelationIdInternal(program, target);
}
