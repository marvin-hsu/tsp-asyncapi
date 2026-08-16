/**
 * The JSON Pointer escaping every `$ref` in this emitter shares.
 *
 * Three layers build a `$ref` from a key: the schema layer, the channel
 * message layer, and the channel server layer. Each one decides the same
 * thing, which is how a key becomes one token of a pointer. That decision
 * belongs in one place, so a layer whose keys become less restricted later
 * cannot silently produce a broken pointer.
 */

/**
 * Escapes one key for use as a JSON Pointer token inside a `$ref`.
 *
 * Per RFC 6901, `~` becomes `~0` and `/` becomes `~1`. A raw `~` or `/`
 * would otherwise produce a `$ref` that every conforming resolver misreads
 * as a path through nested objects.
 *
 * The keys that reach this function come from three sources with three
 * different charsets. A `components.schemas` key can hold any character,
 * because a model or namespace identifier can be backquoted. A
 * `components.messages` key holds neither character today. A `@useServer`
 * name is a bare string this emitter never checks, so it can hold both.
 *
 * Only the `$ref` string needs this escaping. The key stored in the map the
 * pointer points into is left as it is.
 *
 * @param key - The key to place in a pointer
 * @returns The escaped token
 */
export function toJsonPointerToken(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}
