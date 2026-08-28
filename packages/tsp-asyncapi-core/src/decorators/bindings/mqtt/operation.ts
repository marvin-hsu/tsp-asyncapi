import { DecoratorContext, Operation } from "@typespec/compiler";
import { MQTT_BINDING_PROTOCOL } from "../../../constants.js";
import { present } from "../../../optional-fields.js";
import { numberOrSchemaField } from "../fields.js";
import { claimBinding } from "../state.js";
import { MqttOperationBindingState, qos } from "./config.js";

/**
 * The `config` argument of `@mqttOperation`, as the author wrote it.
 * @public
 */
export interface MqttOperationBindingConfig {
  /** How hard the broker tries to deliver: `0`, `1` or `2`. */
  qos?: number;
  /** Whether the broker retains the message. */
  retain?: boolean;
  /** How long the message stays valid. An MQTT 5 field. */
  messageExpiryInterval?: unknown;
}

/**
 * Adds the MQTT operation binding to one operation.
 *
 * The emitted object lands in `operations.<key>.bindings.mqtt`, and it always
 * carries the `bindingVersion` this library targets.
 *
 * Apply it to an operation that carries `@send` or `@receive`.
 *
 * `qos` is `0`, `1` or `2`. Any other value is reported and dropped.
 *
 * `retain` only has meaning on a send. MQTT defines it as an instruction to
 * the broker about the message being published. This emitter does not check
 * the action, because the field is legal on the object either way.
 *
 * `messageExpiryInterval` is an MQTT 5 field. Write it as a number of
 * seconds, or as a Schema Object describing the number.
 *
 * @example
 * ```typespec
 * @mqttOperation(#{ qos: 1, retain: true })
 * @send
 * op publish(event: Reading): void;
 * ```
 *
 * @public
 */
export function $mqttOperation(
  context: DecoratorContext,
  target: Operation,
  config: MqttOperationBindingConfig,
) {
  const configTarget = context.getArgumentTarget(0) ?? target;
  const state: MqttOperationBindingState = {
    ...present("qos", qos(context, "qos", config.qos, configTarget)),
    ...present("retain", config.retain),
    ...present(
      "messageExpiryInterval",
      numberOrSchemaField(
        context,
        MQTT_BINDING_PROTOCOL,
        "messageExpiryInterval",
        config.messageExpiryInterval,
        configTarget,
      ),
    ),
  };

  claimBinding(context, {
    level: "operation",
    target,
    protocol: MQTT_BINDING_PROTOCOL,
    renderer: "mqtt",
    config: state,
    node: configTarget,
  });
}
