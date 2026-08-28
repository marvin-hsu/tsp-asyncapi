/**
 * Every `$ref` an emitted document holds.
 *
 * A promotion moves a fragment into `components` and leaves a reference
 * behind. Walking the whole document at once catches a reference left
 * behind with no matching fragment.
 *
 * The walk proves every pointer names something. It does not prove two
 * fragments never claim one key: a second claim overwrites the first, and
 * every pointer still resolves. That fault is caught where the key is
 * claimed instead.
 *
 * A schema written in another language is copied verbatim, so a pointer
 * inside one belongs to its author, not this emitter.
 * `reportUnresolvedRawSchemaRefs` owns that check, and the walk skips it.
 *
 * The walk stays untyped because a `$ref` can sit at any depth, in a
 * schema, a message, a channel, or an array of any of them. Following the
 * document types instead would need one branch per position, and miss the
 * next position added.
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
