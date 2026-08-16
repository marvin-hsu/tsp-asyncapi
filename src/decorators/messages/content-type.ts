import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { singleApplication } from "../single-application.js";

const contentTypeStateKey = Symbol.for("tsp-asyncapi.contentType");

const [getContentTypeInternal, setContentType] = useStateMap<Model, string>(contentTypeStateKey);

// Every model the decorator ran on, including the applications whose value was
// rejected. A rejected value writes nothing to the map above, so the map alone
// cannot tell a second application from a first one.

const contentTypeAppliedKey = Symbol.for("tsp-asyncapi.contentType.applied");
const guard = singleApplication(contentTypeAppliedKey, "duplicate-content-type-decorator");

/**
 * Sets the `contentType` of a message.
 *
 * The emitter leaves the field out when the decorator is absent. AsyncAPI
 * then applies the document's `defaultContentType`, so writing the same
 * value onto every message would only repeat what the document already
 * says.
 *
 * Apply this decorator only once per model. A second application is an
 * error, the same rule `@message`, `@headers`, and `@correlationId` follow.
 * A message carries one content type, so only one of the applied values could
 * ever reach the output, and the user has no way to tell which one won.
 *
 * The media type must not be empty. A blank media type names no format, and
 * the emitter cannot write it into the document. An empty value is reported
 * and dropped, so the fallback to the document `defaultContentType` is
 * explicit rather than silent.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param contentType - The media type of the payload, such as
 * `application/json`
 *
 * @example
 * ```typespec
 * @message
 * @contentType("application/avro")
 * model OrderCreated {
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $contentType(context: DecoratorContext, target: Model, contentType: string) {
  // Decorators on one declaration run bottom-up, so the application
  // written last in the source runs first and wins. The guard records
  // that this decorator ran, before any value is validated, so a value
  // that fails validation still blocks a later application.
  if (!guard.claim(context, target)) return;
  if (contentType.length === 0) {
    reportDiagnostic(context.program, {
      code: "empty-content-type",
      target: context.decoratorTarget,
    });
    return;
  }
  setContentType(context.program, target, contentType);
}

/**
 * Reads back the content type set by `@contentType`.
 *
 * @param program - The program to read the state from
 * @param target - The model the decorator was applied to
 * @returns The recorded media type, or `undefined` when the decorator was
 * never applied
 *
 * @public
 */
export function getContentType(program: Program, target: Model): string | undefined {
  return getContentTypeInternal(program, target);
}
