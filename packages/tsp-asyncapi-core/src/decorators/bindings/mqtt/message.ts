import { DecoratorContext, Model } from "@typespec/compiler";
import { MQTT_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { schemaField, stringOrSchemaField } from "../fields.js";
import { claimBinding } from "../state.js";
import { MqttMessageBindingState, payloadFormatIndicator } from "./config.js";

/**
 * The `config` argument of `@mqttMessage`, as the author wrote it.
 * @public
 */
export interface MqttMessageBindingConfig {
  /** Whether the payload is bytes (`0`) or UTF-8 (`1`). */
  payloadFormatIndicator?: number;
  /** The data a reply carries back to match it with its request. */
  correlationData?: unknown;
  /** The media type of the payload. */
  contentType?: string;
  /** The topic a reply is sent to. */
  responseTopic?: unknown;
}

/**
 * Adds the MQTT message binding to one message.
 *
 * The emitted object lands in `components.messages.<key>.bindings.mqtt`, and
 * it always carries the `bindingVersion` this library targets.
 *
 * Apply it to a model that also carries `@message`. A model without one is
 * reported once the document is built.
 *
 * All four fields are MQTT 5 fields. A broker speaking MQTT 3 ignores them.
 *
 * `payloadFormatIndicator` is `0` for unspecified bytes and `1` for UTF-8.
 * Any other value is reported and dropped.
 *
 * `correlationData` is a Schema Object. `responseTopic` is a topic name, or a
 * Schema Object describing the name.
 *
 * @example
 * ```typespec
 * @mqttMessage(#{ payloadFormatIndicator: 1, contentType: "application/json" })
 * @message
 * model Reading {
 *   value: float64;
 * }
 * ```
 *
 * @public
 */
export function $mqttMessage(
  context: DecoratorContext,
  target: Model,
  config: MqttMessageBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: MqttMessageBindingState = {
    ...present(
      "payloadFormatIndicator",
      payloadFormatIndicator(context, config.payloadFormatIndicator, configTarget),
    ),
    ...present(
      "correlationData",
      schemaField(
        context,
        MQTT_BINDING_PROTOCOL,
        "correlationData",
        config.correlationData,
        configTarget,
      ),
    ),
    ...present("contentType", trimmed(config.contentType)),
    ...present(
      "responseTopic",
      stringOrSchemaField(
        context,
        MQTT_BINDING_PROTOCOL,
        "responseTopic",
        config.responseTopic,
        configTarget,
      ),
    ),
  };

  claimBinding(context, {
    level: "message",
    target,
    protocol: MQTT_BINDING_PROTOCOL,
    renderer: "mqtt",
    config: state,
    node: configTarget,
  });
}
