/**
 * The recorded shape of every MQTT binding, and the field checks the three
 * decorators share.
 *
 * One binding covers MQTT 3 and MQTT 5. The fields only MQTT 5 defines are
 * optional, so a document for MQTT 3 leaves them out. This emitter does not
 * ask which version a server speaks, because the binding itself does not.
 */

import { DecoratorContext, DiagnosticTarget } from "@typespec/compiler";
import { MQTT_BINDING_PROTOCOL } from "../../../constants.js";
import { present, trimmed } from "../../../optional-fields.js";
import type {
  MqttLastWillObject,
  MqttMessageBindingObject,
  MqttOperationBindingObject,
  MqttServerBindingObject,
} from "../../../types/index.js";
import { nonEmptyObject, numericField, objectField } from "../fields.js";

/**
 * What one MQTT decorator records, for each of the three levels.
 *
 * Each one is the emitted object without `bindingVersion`. That field is
 * appended when the document is built. Deriving these rather than writing them out again keeps the
 * recorded shape and the emitted shape from drifting.
 *
 * There is no channel level. The MQTT binding defines a channel object that
 * its own text says must carry no property.
 *
 * @internal
 */
export type MqttServerBindingState = Omit<MqttServerBindingObject, "bindingVersion">;

/** @internal */
export type MqttOperationBindingState = Omit<MqttOperationBindingObject, "bindingVersion">;

/** @internal */
export type MqttMessageBindingState = Omit<MqttMessageBindingObject, "bindingVersion">;

/** The three levels of delivery effort MQTT defines. */
const QOS_VALUES = [0, 1, 2];

/** The two payload formats MQTT 5 defines: bytes and UTF-8. */
const PAYLOAD_FORMAT_VALUES = [0, 1];

/**
 * Checks a quality of service field.
 *
 * MQTT states that the value must be `0`, `1` or `2`. A value outside that
 * set names a delivery mode no broker implements.
 *
 * @param context - The decorator context
 * @param field - The field name, for the diagnostic
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function qos(
  context: DecoratorContext,
  field: string,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  return numericField(context, MQTT_BINDING_PROTOCOL, field, value, QOS_VALUES, target);
}

/**
 * Checks the `payloadFormatIndicator` field of the message binding.
 *
 * MQTT 5 states that `0` means unspecified bytes and `1` means UTF-8. There
 * is no third format.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it
 * @param target - Where a problem is reported
 * @returns The value, or `undefined` when it was absent or rejected
 * @internal
 */
export function payloadFormatIndicator(
  context: DecoratorContext,
  value: number | undefined,
  target: DiagnosticTarget,
): number | undefined {
  return numericField(
    context,
    MQTT_BINDING_PROTOCOL,
    "payloadFormatIndicator",
    value,
    PAYLOAD_FORMAT_VALUES,
    target,
  );
}

/**
 * Checks the `lastWill` field of the server binding.
 *
 * The Last Will and Testament is the message a broker sends when a client
 * goes away without saying goodbye. It carries four fields, and only `qos`
 * has a rule of its own.
 *
 * A rejected `qos` takes only itself away. The rest of the will still
 * describes the message the broker sends, and dropping it as well would lose
 * the topic the author wrote.
 *
 * A will with nothing left in it is dropped. An empty object states no will
 * at all, so emitting it would claim the client configured one.
 *
 * @param context - The decorator context
 * @param value - The field as the author wrote it, still marshalled
 * @param target - Where a problem is reported
 * @returns The Last Will object, or `undefined` when it was absent, empty, or
 * not an object
 * @internal
 */
export function lastWill(
  context: DecoratorContext,
  value: unknown,
  target: DiagnosticTarget,
): MqttLastWillObject | undefined {
  const plain = objectField(context, MQTT_BINDING_PROTOCOL, "lastWill", value, target);
  if (plain === undefined) return undefined;

  const will: MqttLastWillObject = {
    ...present("topic", trimmed(plain.topic as string | undefined)),
    ...present("qos", qos(context, "lastWill.qos", plain.qos as number | undefined, target)),
    ...present("message", trimmed(plain.message as string | undefined)),
    ...present("retain", plain.retain as boolean | undefined),
  };
  return nonEmptyObject(will);
}
