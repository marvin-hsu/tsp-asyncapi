/**
 * The Avro name rules.
 *
 * The Avro specification states that a name starts with `[A-Za-z_]` and
 * continues with `[A-Za-z0-9_]`, and that a namespace is a dot separated
 * sequence of such names. A record, an enum and a fixed type are all named by
 * these rules, and so is every field and every enum symbol.
 *
 * The rules live here, next to the decorator that takes a namespace from the
 * author, because that is the first place a name can be refused.
 */

const AVRO_NAME = /^[A-Za-z_]\w*$/;

/**
 * Tells whether the text is a legal Avro name.
 *
 * @internal
 */
export function isAvroName(name: string): boolean {
  return AVRO_NAME.test(name);
}

/**
 * Tells whether the text is a legal Avro namespace.
 *
 * The empty namespace is written by leaving the field out, not by an empty
 * string, so this rejects an empty text.
 *
 * @internal
 */
export function isAvroNamespace(name: string): boolean {
  return name.length > 0 && name.split(".").every(isAvroName);
}
