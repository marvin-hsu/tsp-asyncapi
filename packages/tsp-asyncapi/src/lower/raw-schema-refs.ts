import { Model, Program } from "@typespec/compiler";
import type { AsyncAPIDocument } from "../types/index.js";
import { reportDiagnostic, localRef, isPlainObject } from "tsp-asyncapi-core";
import { resolvesInDocument } from "./json-pointer.js";

/** The field of a Multi Format Schema Object that carries the schema. */
const SCHEMA_KEY = "schema";

/**
 * Reads the schema out of one slot of a message, when that slot holds a raw
 * schema.
 *
 * `payload` holds either a Multi Format Schema Object or an ordinary schema.
 * A `schema` field tells the two apart. Only a Multi Format Schema Object has
 * one, because the emitter builds it from a raw schema decorator alone.
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
 * Reports every raw schema whose reference into this document reaches
 * nothing.
 *
 * The emitter copies a raw schema exactly as written, so a reference inside
 * it is the author's, not the emitter's. A reference that starts with `#/`
 * points into the emitted document. The emitter owns the other end of such a
 * reference, so it can say whether that end exists.
 *
 * The check runs on the finished document. A `components.schemas` key comes
 * from the models the messages reach, and the messages are built before the
 * channels and the operations. So the answer is only settled once every
 * section is in place.
 *
 * This is a trap in practice, which is why the check exists. A `@rawPayload`
 * model contributes nothing to `components.schemas`, so the obvious target
 * `#/components/schemas/<ModelName>` holds nothing unless another message
 * reaches that model.
 *
 * Only the top level of the schema is read, the same depth the decorator
 * reads. A reference deeper inside is written in the schema language itself,
 * and the emitter does not know that grammar.
 *
 * The rule is separate from `raw-schema-local-ref`. That one compares the two
 * `schemaFormat` values, and it needs a target to compare against. A target
 * that does not exist fails both rules, and both are reported.
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

  // Every key of `messageKeys` names an emitted message. A model that a key
  // collision dropped never reached that map.
  for (const [model, key] of messageKeys) {
    const message = messages[key];
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
