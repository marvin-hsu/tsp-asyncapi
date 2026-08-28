/**
 * The lower half of the raw-schema reference check.
 *
 * A `@rawPayload` schema is copied verbatim, so a `#/`-prefixed reference
 * inside it targets the emitted document, and the emitter can confirm
 * whether that target exists. This reports every reference that does not.
 */

import { Model, Program } from "@typespec/compiler";
import type { AsyncAPIDocument } from "../types/index.js";
import { reportDiagnostic, localRef, isPlainObject } from "tsp-asyncapi-core";
import { resolvesInDocument } from "./json-pointer.js";

/** The field of a Multi Format Schema Object that carries the schema. */
const SCHEMA_KEY = "schema";

/**
 * Reads the schema out of one slot of a message, when that slot holds a raw
 * schema. Only a Multi Format Schema Object carries a `schema` field.
 *
 * @param slot - The value of `payload` or of `headers`
 * @returns The raw schema, or `undefined` when the slot holds no raw schema
 */
function rawSchemaOf(slot: unknown): unknown {
  if (!isPlainObject(slot) || !Object.hasOwn(slot, SCHEMA_KEY)) {
    return undefined;
  }
  return slot[SCHEMA_KEY];
}

/**
 * Reports every raw-schema reference into this document that resolves to
 * nothing.
 *
 * A `components.schemas` key depends on every message, channel, and
 * operation, so only the finished document can answer whether a target
 * exists. A `@rawPayload` model contributes nothing to `components.schemas`
 * by itself, so `#/components/schemas/<ModelName>` can resolve to nothing
 * even when the model is real.
 *
 * Only the top level of the schema is read, the depth the decorator reads.
 * A reference deeper inside uses the schema's own grammar, which the emitter
 * does not parse.
 *
 * `raw-schema-local-ref` reports the matching `schemaFormat` mismatch. Both
 * rules can fire on the same reference.
 *
 * @param program - The program the messages belong to
 * @param document - The finished document
 * @param messageKeys - The `components.messages` key each model claimed
 */
export function reportUnresolvedRawSchemaRefs(
  program: Program,
  document: AsyncAPIDocument,
  messageKeys: Map<Model, string>,
): void {
  const messages = document.components?.messages;
  if (messages === undefined) return;

  // A model a key collision dropped never reached this map. The lookup
  // still guards: that invariant belongs to another package, and a break
  // there must report nothing here rather than throw.
  for (const [model, key] of messageKeys) {
    const message = Object.hasOwn(messages, key) ? messages[key] : undefined;
    if (message === undefined) continue;
    for (const slot of [message.payload, message.headers]) {
      const ref = localRef(rawSchemaOf(slot));
      if (ref === undefined || resolvesInDocument(document, ref)) continue;
      reportDiagnostic(program, {
        code: "unresolved-raw-schema-ref",
        target: model,
        format: { ref },
      });
    }
  }
}
