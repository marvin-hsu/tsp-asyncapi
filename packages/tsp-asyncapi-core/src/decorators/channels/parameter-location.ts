/**
 * The `@parameterLocation` decorator, and the state it records for one
 * channel parameter.
 *
 * `@correlationId` shares the runtime expression check with this decorator,
 * through `runtime-expression.js`, so the two never judge the grammar
 * differently. This module does not check that the expression names a field
 * the payload or headers schema declares.
 */
import { DecoratorContext, ModelProperty, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { isRuntimeExpression } from "../runtime-expression.js";
import { singleApplication } from "../single-application.js";

const parameterLocationStateKey = Symbol.for("tsp-asyncapi.parameterLocation");

const parameterLocationAppliedKey = Symbol.for("tsp-asyncapi.parameterLocation.applied");
const guard = singleApplication(
  parameterLocationAppliedKey,
  "duplicate-parameter-location-decorator",
);

const [getParameterLocationInternal, setParameterLocation] = useStateMap<ModelProperty, string>(
  parameterLocationStateKey,
);

/**
 * Sets the `location` of one channel address parameter.
 *
 * A channel parameter takes its value from somewhere inside the message.
 * `location` is a runtime expression that names that place, such as
 * `$message.payload#/user/id`. It is the only field of the AsyncAPI
 * Parameter Object that no other TypeSpec construct can fill.
 *
 * Apply this decorator only once per property. A second application is an
 * error, since only one of the applied locations could ever reach the
 * output and the author has no way to tell which one won.
 *
 * @param context - The decorator context
 * @param target - The operation parameter that declares a channel parameter
 * @param location - A runtime expression that locates the parameter value
 *
 * @example
 * ```typespec
 * @channel("users.{userId}.signedup")
 * interface UserChannel {
 *   publish(@parameterLocation("$message.payload#/user/id") userId: string, event: UserSignedUp): void;
 * }
 * ```
 *
 * @public
 */
export function $parameterLocation(
  context: DecoratorContext,
  target: ModelProperty,
  location: string,
) {
  // Decorators on one declaration run bottom-up: the last one written wins.
  // The guard claims before the value is checked, so a rejected value still
  // blocks a later application.
  if (guard.claim(context, target) !== "first") return;
  if (!isRuntimeExpression(location)) {
    // Nothing is recorded, so no `location` reaches the document. An
    // expression this emitter cannot parse is one no AsyncAPI tool can
    // follow either.
    reportDiagnostic(context.program, {
      code: "invalid-parameter-location",
      target,
      format: { location },
    });
    return;
  }
  setParameterLocation(context.program, target, location);
}

/**
 * Reads back the location set by `@parameterLocation`.
 *
 * @param program - The program to read the state from
 * @param target - The property the decorator was applied to
 * @returns The recorded expression, or `undefined` when the decorator was
 * never applied, and when its expression was rejected
 *
 * @public
 */
export function getParameterLocation(program: Program, target: ModelProperty): string | undefined {
  return getParameterLocationInternal(program, target);
}
