import { RawSchemaState } from "../../decorators/index.js";
import { MultiFormatSchemaObject } from "../../types.js";

/**
 * Builds the Multi Format Schema Object of one raw schema.
 *
 * The state a decorator records is the object itself, so this copies it. The
 * copy keeps the emitted document independent of the state map. `payload` and
 * `headers` both accept the object, and both slots go through this function.
 * So the two slots cannot drift apart.
 *
 * @param state - The format and schema a raw schema decorator recorded
 * @returns The Multi Format Schema Object to write into the message
 */
export function buildRawSchema(state: RawSchemaState): MultiFormatSchemaObject {
  return { ...state };
}
