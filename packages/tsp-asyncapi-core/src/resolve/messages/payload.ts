/**
 * Turns a recorded raw schema into the Multi Format Schema Object it emits.
 *
 * It reads the state a raw schema decorator recorded and hands the value back
 * unexpanded. Expanding a TypeSpec model into a schema is the lower half's
 * work; a raw schema is already in its final format and needs no expansion.
 */

import { RawSchemaState } from "../../decorators/index.js";
import type { MultiFormatSchemaObject } from "../../types/index.js";

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
