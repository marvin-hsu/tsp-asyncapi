import { DecoratorContext, ModelProperty, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { isRuntimeExpression } from "../runtime-expression.js";
import { singleApplication } from "../single-application.js";

const parameterLocationStateKey = Symbol.for("tsp-asyncapi.parameterLocation");

const parameterLocationAppliedKey = Symbol.for("tsp-asyncapi.parameterLocation.applied");
const claim = singleApplication(
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
 * The emitter checks the format of the expression only. It does not check
 * that the pointer names a field the headers or the payload schema declares.
 * This is the rule `@correlationId` follows, and the two share one check.
 *
 * Apply this decorator only once per property. A second application is an
 * error. Only one of the applied locations could ever reach the output, and
 * the user has no way to tell which one won.
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
  // Decorators on one declaration run bottom-up, so the application written
  // last in the source runs first and wins. The guard records that this
  // decorator ran, before any value is validated, so a value that fails
  // validation still blocks a later application.
  if (!claim(context, target)) return;
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
