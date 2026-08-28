import { DecoratorContext, Operation } from "@typespec/compiler";
import { HTTP_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import type { HttpOperationBindingObject } from "../../../types/index.js";
import { enumeratedField, namedValuesSchemaField } from "../fields.js";
import { claimBinding } from "../state.js";

/**
 * `@httpOperation`, which fills the operation-level HTTP Bindings Object.
 */

/**
 * What `@httpOperation` records.
 *
 * It is the emitted object without `bindingVersion`. That field is appended
 * when the document is built.
 */
type HttpOperationBindingState = Omit<HttpOperationBindingObject, "bindingVersion">;

/** The nine methods the HTTP binding allows. */
const HTTP_METHODS = [
  "GET",
  "PUT",
  "POST",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "TRACE",
];

/**
 * The `config` argument of `@httpOperation`, as the author wrote it.
 * @public
 */
export interface HttpOperationBindingConfig {
  /** The HTTP method of the request, such as `POST`. */
  method?: string;
  /** The query parameters of the request, as a Schema Object. */
  query?: unknown;
}

/**
 * Adds the HTTP operation binding to one operation.
 *
 * The emitted object lands in `operations.<key>.bindings.http`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to an operation that carries `@send` or `@receive`.
 *
 * `method` is one of the nine methods the binding lists. Any other value is
 * reported and dropped.
 *
 * `query` is a Schema Object. Write it as an object literal of type `object`
 * with a `properties` key. AsyncAPI states both requirements.
 *
 * @param context - The decorator context
 * @param target - The operation
 * @param config - The HTTP operation binding fields
 *
 * @example
 * ```typespec
 * @httpOperation(#{
 *   method: "POST",
 *   query: #{ type: "object", properties: #{ since: #{ type: "string" } } }
 * })
 * @send
 * op publish(event: Notice): void;
 * ```
 *
 * @public
 */
export function $httpOperation(
  context: DecoratorContext,
  target: Operation,
  config: HttpOperationBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: HttpOperationBindingState = {
    ...present(
      "method",
      enumeratedField(
        context,
        HTTP_BINDING_PROTOCOL,
        "method",
        config.method,
        HTTP_METHODS,
        configTarget,
      ),
    ),
    ...present(
      "query",
      namedValuesSchemaField(context, HTTP_BINDING_PROTOCOL, "query", config.query, configTarget),
    ),
  };

  claimBinding(context, {
    level: "operation",
    target,
    protocol: HTTP_BINDING_PROTOCOL,
    renderer: "http",
    config: state,
    node: configTarget,
  });
}
