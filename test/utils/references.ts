/**
 * Every `$ref` an emitted document holds.
 *
 * A promotion moves a fragment into `components` and leaves a reference
 * behind. The fragment can be left out while the reference is written, which
 * gives a document that says nothing where it claims to say something.
 * Walking the whole document finds that, in every section at once.
 *
 * The walk proves that every pointer names something. It does not prove that
 * two fragments never claim one key. A second claim overwrites the first and
 * every pointer still resolves, so that fault is caught where the key is
 * claimed instead.
 *
 * A schema written in another language is copied verbatim, so a pointer
 * inside one belongs to its author rather than to this emitter.
 * `reportUnresolvedRawSchemaRefs` owns that check, and the walk skips it.
 *
 * The walk is untyped on purpose. A `$ref` can sit at any depth, inside a
 * schema, a message, a channel, or an array of any of them. A reader that
 * followed the document types would need one branch per position, and it
 * would miss the next position added.
 *
 * @param node - The document, or any part of it
 * @param found - The pointers collected so far
 * @returns Every pointer this emitter wrote, in document order
 */
export function referencesIn(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) referencesIn(item, found);
    return found;
  }
  if (node === null || typeof node !== "object") return found;
  if ("schemaFormat" in node) return found;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "$ref" && typeof value === "string") found.push(value);
    else referencesIn(value, found);
  }
  return found;
}
