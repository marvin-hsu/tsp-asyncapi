/**
 * Every `$ref` an emitted document holds.
 *
 * A promotion moves a fragment into `components` and leaves a reference
 * behind. Two steps of that can go wrong: the fragment is left out while the
 * reference is written, or two fragments claim one key. Walking the whole
 * document finds both, in every section at once.
 *
 * A schema written in another language is copied verbatim, so a pointer
 * inside one belongs to its author rather than to this emitter.
 * `reportUnresolvedRawSchemaRefs` owns that check, and the walk skips it.
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
