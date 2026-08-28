import { DecoratorContext, Namespace } from "@typespec/compiler";
import { MQTT_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import { numberOrSchemaField } from "../fields.js";
import { claimBinding } from "../state.js";
import { MqttServerBindingState, lastWill } from "./config.js";

/**
 * The `config` argument of `@mqttServer`, as the author wrote it.
 * @public
 */
export interface MqttServerBindingConfig {
  /** The client identifier. */
  clientId?: string;
  /** Whether the connection starts a new session. */
  cleanSession?: boolean;
  /** The Last Will and Testament configuration. */
  lastWill?: unknown;
  /** The number of seconds between two control packets. */
  keepAlive?: number;
  /** How long a session outlives its connection. An MQTT 5 field. */
  sessionExpiryInterval?: unknown;
  /** The largest packet the client accepts. An MQTT 5 field. */
  maximumPacketSize?: unknown;
}

/**
 * Adds the MQTT server binding to the servers of one namespace.
 *
 * The emitted object lands in `servers.<name>.bindings.mqtt`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to the service namespace. Every server that namespace declares
 * gets its own copy of the binding. `@server` is repeatable and keyed by
 * name, so no decorator target can single one server out. This follows the
 * rule `@kafkaServer` already uses.
 *
 * A namespace that declares no emitted server is reported once the document
 * is built.
 *
 * `lastWill.qos` is `0`, `1` or `2`. Any other value is reported and dropped,
 * and the rest of the will is kept.
 *
 * `sessionExpiryInterval` and `maximumPacketSize` are MQTT 5 fields. Write
 * each one as a number, or as a Schema Object describing the number.
 *
 * @example
 * ```typespec
 * @mqttServer(#{
 *   clientId: "sensor-gateway",
 *   cleanSession: true,
 *   keepAlive: 60,
 *   lastWill: #{ topic: "sensors/status", qos: 1, message: "offline", retain: true },
 * })
 * @server("production", #{ host: "mqtt.example.com:1883", protocol: "mqtt" })
 * namespace Sensors;
 * ```
 *
 * @public
 */
export function $mqttServer(
  context: DecoratorContext,
  target: Namespace,
  config: MqttServerBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: MqttServerBindingState = {
    ...present("clientId", trimmed(config.clientId)),
    ...present("cleanSession", config.cleanSession),
    ...present("lastWill", lastWill(context, config.lastWill, configTarget)),
    ...present("keepAlive", config.keepAlive),
    ...present(
      "sessionExpiryInterval",
      numberOrSchemaField(
        context,
        MQTT_BINDING_PROTOCOL,
        "sessionExpiryInterval",
        config.sessionExpiryInterval,
        configTarget,
      ),
    ),
    ...present(
      "maximumPacketSize",
      numberOrSchemaField(
        context,
        MQTT_BINDING_PROTOCOL,
        "maximumPacketSize",
        config.maximumPacketSize,
        configTarget,
      ),
    ),
  };

  claimBinding(context, {
    level: "server",
    target,
    protocol: MQTT_BINDING_PROTOCOL,
    renderer: "mqtt",
    config: state,
    node: configTarget,
  });
}
