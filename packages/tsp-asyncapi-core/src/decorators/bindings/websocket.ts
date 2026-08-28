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

import { DecoratorContext, Interface, Namespace } from "@typespec/compiler";
import { WEBSOCKET_BINDING_PROTOCOL } from "../../constants.js";
import { present } from "../../optional-fields.js";
import type { WebSocketChannelBindingObject } from "../../types/index.js";
import { enumeratedField, namedValuesSchemaField } from "./fields.js";
import { claimBinding } from "./state.js";

/**
 * What `@websocketChannel` records.
 *
 * It is the emitted object without `bindingVersion`, added when the document
 * is built. Deriving this from the emitted type keeps the two from drifting.
 */
type WebSocketChannelBindingState = Omit<WebSocketChannelBindingObject, "bindingVersion">;

/** The two methods the WebSocket binding allows a handshake to use. */
const HANDSHAKE_METHODS = ["GET", "POST"];

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
    ...present(
      "query",
      namedValuesSchemaField(
        context,
        WEBSOCKET_BINDING_PROTOCOL,
        "query",
        config.query,
        configTarget,
      ),
    ),
    ...present(
      "headers",
      namedValuesSchemaField(
        context,
        WEBSOCKET_BINDING_PROTOCOL,
        "headers",
        config.headers,
        configTarget,
      ),
    ),
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
