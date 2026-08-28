import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../../lib.js";
import { trimmed } from "../../optional-fields.js";
import { singleApplication } from "../single-application.js";

const contentTypeStateKey = Symbol.for("tsp-asyncapi.contentType");

const [getContentTypeInternal, setContentType] = useStateMap<Model, string>(contentTypeStateKey);

// Tracks every model the decorator ran on, including rejected applications.
// A rejected value writes nothing to the map above, so the map alone cannot
// tell a second application from a first one.

const contentTypeAppliedKey = Symbol.for("tsp-asyncapi.contentType.applied");
const guard = singleApplication(contentTypeAppliedKey, "duplicate-content-type-decorator");

/**
 * Sets the `contentType` of a message.
 *
 * The emitter omits the field when the decorator is absent, and AsyncAPI
 * falls back to the document's `defaultContentType`.
 *
 * Apply this decorator only once per model, the same rule `@message`,
 * `@headers`, and `@correlationId` follow. A message carries one content
 * type, so a second application leaves no way to tell which value won.
 *
 * The media type must not be empty. A blank value is reported and dropped,
 * so the fallback to `defaultContentType` stays explicit rather than silent.
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
  // Bottom-up: the last application in source runs first. The guard claims
  // before validation, so a rejected value still blocks a later one.
  if (guard.claim(context, target) !== "first") return;
  // Trim first: a value of spaces alone names no format.
  const mediaType = trimmed(contentType);
  if (mediaType === undefined) {
    reportDiagnostic(context.program, {
      code: "empty-content-type",
      target: context.decoratorTarget,
    });
    return;
  }
  setContentType(context.program, target, mediaType);
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
