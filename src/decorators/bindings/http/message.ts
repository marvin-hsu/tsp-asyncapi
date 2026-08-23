import { DecoratorContext, DiagnosticTarget, Model } from "@typespec/compiler";
import { HTTP_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import type { HttpMessageBindingObject } from "../../../types/index.js";
import { namedValuesSchemaField, reportBindingField } from "../fields.js";
import { claimBinding } from "../state.js";

/**
 * What `@httpMessage` records.
 *
 * It is the emitted object without `bindingVersion`. That field is appended
 * when the document is built.
 */
type HttpMessageBindingState = Omit<HttpMessageBindingObject, "bindingVersion">;

/** The lowest and highest status code RFC 9110 defines. */
const STATUS_CODE_RANGE = { lowest: 100, highest: 599 };

/**
 * The `config` argument of `@httpMessage`, as the author wrote it.
 * @public
 */
export interface HttpMessageBindingConfig {
  /** The HTTP headers of the message, as a Schema Object. */
  headers?: unknown;
  /** The response status code. It applies to a reply message only. */
  statusCode?: number;
}

/**
 * Adds the HTTP message binding to one message.
 *
 * The emitted object lands in `components.messages.<key>.bindings.http`, and
 * it always carries the `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`. A model without one is
 * reported once the document is built.
 *
 * `headers` is a Schema Object. Write it as an object literal of type
 * `object` with a `properties` key. AsyncAPI states both requirements.
 *
 * `statusCode` is a status code from RFC 9110, so it is between 100 and 599.
 * AsyncAPI states that it only applies to a message named by an Operation
 * Reply Object. This emitter does not check that rule, because it spans two
 * objects of the document.
 *
 * @param context - The decorator context
 * @param target - The message model
 * @param config - The HTTP message binding fields
 *
 * @example
 * ```typespec
 * @httpMessage(#{
 *   headers: #{ type: "object", properties: #{ `X-Trace-Id`: #{ type: "string" } } }
 * })
 * @message
 * model Notice {
 *   body: string;
 * }
 * ```
 *
 * @public
 */
export function $httpMessage(
  context: DecoratorContext,
  target: Model,
  config: HttpMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: HttpMessageBindingState = {
    ...present(
      "headers",
      namedValuesSchemaField(
        context,
        HTTP_BINDING_PROTOCOL,
        "headers",
        config.headers,
        configTarget,
      ),
    ),
    ...present("statusCode", statusCode(context, config.statusCode, configTarget)),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: HTTP_BINDING_PROTOCOL,
    renderer: "http",
    config: state,
    node: configTarget,
  });
}

/**
 * Checks the `statusCode` field.
 *
 * RFC 9110 defines status codes from 100 to 599. A number outside that range
 * is not a status code, so no client can act on it.
 */
function statusCode(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  if (value === undefined) return undefined;
  if (value < STATUS_CODE_RANGE.lowest || value > STATUS_CODE_RANGE.highest) {
    reportBindingField(
      context,
      HTTP_BINDING_PROTOCOL,
      "statusCode",
      `a status code from ${String(STATUS_CODE_RANGE.lowest)} to ${String(STATUS_CODE_RANGE.highest)}`,
      target,
    );
    return undefined;
  }
  return value;
}
