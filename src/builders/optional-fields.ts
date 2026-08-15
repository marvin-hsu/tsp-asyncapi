/**
 * One decision about whether an optional field reaches the document.
 *
 * The rule is that a field with nothing to say is left out. An empty string
 * would claim the message has a blank title rather than no title, and a
 * reader cannot tell a deliberate blank from an oversight.
 *
 * The rule used to be written again at each place that emitted a field, and
 * the copies drifted: some tested `!== undefined`, which lets an empty
 * string through, and some tested the value itself, which does not. Every
 * emitted field now goes through the functions here, so the rule has one
 * definition and a new field cannot be written the old way by accident.
 */

/**
 * Keeps a text field only when it says something.
 *
 * Spread the result into the object under construction:
 *
 * ```ts
 * return { name, ...text("description", metadata.description) };
 * ```
 *
 * @param key - The field name in the emitted document
 * @param value - The text, which may be absent or blank
 * @returns A single-entry object, or an empty one when there is nothing to
 * say
 */
export function text<K extends string>(
  key: K,
  value: string | undefined,
): Record<K, string> | Record<string, never> {
  if (value === undefined || value.trim() === "") return {};
  return { [key]: value } as Record<K, string>;
}

/**
 * Keeps a field whose value is not text.
 *
 * A blank check makes no sense for these, so only an absent value is left
 * out. `false` and `0` are real values and are kept, which is why this
 * cannot be a plain truthiness test.
 *
 * @param key - The field name in the emitted document
 * @param value - The value, which may be absent
 * @returns A single-entry object, or an empty one when the value is absent
 */
export function present<K extends string, V>(
  key: K,
  value: V | undefined,
): Record<K, V> | Record<string, never> {
  if (value === undefined) return {};
  return { [key]: value } as Record<K, V>;
}
