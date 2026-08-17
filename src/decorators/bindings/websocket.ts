/**
 * The WebSocket binding.
 *
 * One decorator covers the whole protocol. The WebSocket binding defines a
 * channel object and nothing else, because its own text says the server,
 * operation and message bindings must carry no property. A WebSocket
 * connection is opened once, and the handshake it is opened with is a
 * property of the channel.
 *
 * So this file stays one file. The other protocols group their decorators in
 * a folder, and this one has no second decorator to group with.
 */

import { DecoratorContext, DiagnosticTarget, Interface, Namespace } from "@typespec/compiler";
import { WEBSOCKET_BINDING_PROTOCOL } from "../../constants.js";
import { present } from "../../optional-fields.js";
import { WebSocketChannelBindingObject } from "../../types/index.js";
import { enumeratedField, reportBindingField, schemaField } from "./fields.js";
import { claimBinding } from "./state.js";

/**
 * What `@websocketChannel` records.
 *
 * It is the emitted object without `bindingVersion`. The renderer adds that
 * field. Deriving the shape rather than writing it out again keeps the two
 * from drifting.
 * @internal
 */
export type WebSocketChannelBindingState = Omit<WebSocketChannelBindingObject, "bindingVersion">;

/** The two methods the WebSocket binding allows a handshake to use. */
const HANDSHAKE_METHODS = ["GET", "POST"];

/**
 * Checks one Schema Object field of the handshake.
 *
 * `query` and `headers` each describe a set of named values. The binding
 * says the schema must be of type `object` and must have a `properties` key.
 * A schema that says neither describes no parameter at all, so a generator
 * reading it produces a handshake with nothing in it.
 *
 * A `$ref` passes without either field. The reference names a schema that
 * lives elsewhere, and this emitter does not follow it.
 *
 * @param context - The decorator context
 * @param field - The field name, for the diagnostic
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The plain JSON object, or `undefined` when it was absent or
 * rejected
 */
function handshakeSchema(
  context: DecoratorContext,
  field: string,
  value: unknown,
  target: DiagnosticTarget,
): Record<string, unknown> | undefined {
  const schema = schemaField(context, WEBSOCKET_BINDING_PROTOCOL, field, value, target);
  if (schema === undefined) return undefined;
  if (schema.$ref !== undefined) return schema;
  if (schema.type !== "object" || schema.properties === undefined) {
    reportBindingField(
      context,
      WEBSOCKET_BINDING_PROTOCOL,
      field,
      'an object schema with a "properties" key',
      target,
    );
    return undefined;
  }
  return schema;
}

/**
 * The `config` argument of `@websocketChannel`, as the author wrote it.
 * @public
 */
export interface WebSocketChannelBindingConfig {
  /** The HTTP method that opens the connection: `GET` or `POST`. */
  method?: string;
  /** The query parameters of the handshake, as a Schema Object. */
  query?: unknown;
  /** The headers of the handshake, as a Schema Object. */
  headers?: unknown;
}

/**
 * Adds the WebSocket binding to one channel.
 *
 * The emitted object lands in `channels.<key>.bindings.ws`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the interface or namespace that carries `@channel` or
 * `@dynamicChannel`. A target without one is reported once the document is
 * built.
 *
 * `method` is `GET` or `POST`. Any other value is reported and dropped.
 *
 * `query` and `headers` are Schema Objects. Write each one as an object
 * literal of type `object` with a `properties` key. The emitter writes it
 * into the document as written.
 *
 * The WebSocket binding has no server, operation or message object. Its own
 * text says those three must carry no property.
 *
 * @param context - The decorator context
 * @param target - The channel interface or namespace
 * @param config - The WebSocket channel binding fields
 *
 * @example
 * ```typespec
 * @websocketChannel(#{
 *   method: "GET",
 *   query: #{ type: "object", properties: #{ token: #{ type: "string" } } },
 * })
 * @channel("/events")
 * interface EventStream {}
 * ```
 *
 * @public
 */
export function $websocketChannel(
  context: DecoratorContext,
  target: Interface | Namespace,
  config: WebSocketChannelBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: WebSocketChannelBindingState = {
    ...present(
      "method",
      enumeratedField(
        context,
        WEBSOCKET_BINDING_PROTOCOL,
        "method",
        config.method,
        HANDSHAKE_METHODS,
        configTarget,
      ),
    ),
    ...present("query", handshakeSchema(context, "query", config.query, configTarget)),
    ...present("headers", handshakeSchema(context, "headers", config.headers, configTarget)),
  };

  claimBinding(context, {
    level: "channel",
    target,
    protocol: WEBSOCKET_BINDING_PROTOCOL,
    renderer: "websocket",
    config: state,
    node: configTarget,
  });
}
