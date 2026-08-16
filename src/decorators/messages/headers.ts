import { DecoratorContext, Model, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { singleApplication } from "../single-application.js";

const headersStateKey = Symbol.for("tsp-asyncapi.headers");

const [getHeadersModelInternal, setHeadersModel] = useStateMap<Model, Model>(headersStateKey);

const headersAppliedKey = Symbol.for("tsp-asyncapi.headers.applied");
const claim = singleApplication(headersAppliedKey, "duplicate-headers-decorator");

/**
 * Sets the whole `headers` schema of a message from a separate model.
 *
 * Use this when the headers are a model of their own, rather than a few
 * flat fields of the payload model. The headers model may nest: a property
 * of it can be another model, and that model becomes a nested object in the
 * emitted headers schema. AsyncAPI's own examples describe headers that
 * way.
 *
 * The headers model must be an object type. AsyncAPI requires the `headers`
 * schema to be a key/value map. An array-backed model is reported as
 * `headers-not-object`.
 *
 * Do not mix this with a field-level `@header` on the same message. Two
 * sources for one field have no obvious winner, so the emitter reports
 * `duplicate-message-headers` and emits neither.
 *
 * Apply this decorator only once per model. A second application is an
 * error, the same rule `@message` follows. Only one of the applied models
 * could ever reach the output, and the user has no way to tell which one
 * won.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param headers - The model that describes the message headers
 *
 * @example
 * ```typespec
 * model MqmdHeaders {
 *   MQMD: MqmdFields;
 * }
 *
 * @message
 * @headers(MqmdHeaders)
 * model OrderCreated {
 *   orderId: string;
 * }
 * ```
 *
 * @public
 */
export function $headers(context: DecoratorContext, target: Model, headers: Model) {
  // Decorators on one declaration run bottom-up, so the application
  // written last in the source runs first and wins. The guard records
  // that this decorator ran, before any value is validated, so a value
  // that fails validation still blocks a later application.
  if (!claim(context, target)) return;
  setHeadersModel(context.program, target, headers);
}

/**
 * Reads back the model that `@headers` names.
 *
 * @param program - The program to read the state from
 * @param target - The model the decorator was applied to
 * @returns The recorded headers model, or `undefined` when the decorator
 * was never applied
 *
 * @public
 */
export function getHeadersModel(program: Program, target: Model): Model | undefined {
  return getHeadersModelInternal(program, target);
}
