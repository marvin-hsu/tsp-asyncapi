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
 * The names Avro keeps for a type of its own.
 *
 * These are the eight primitive names and the six complex ones. A schema
 * spells a type by name, so a record named `int` is written into a file that
 * reads back as the primitive.
 */
const AVRO_RESERVED_NAMES: readonly string[] = [
  "null",
  "boolean",
  "int",
  "long",
  "float",
  "double",
  "bytes",
  "string",
  "record",
  "enum",
  "array",
  "map",
  "union",
  "fixed",
];

/**
 * The names a named type may not take, as a message lists them.
 *
 * @internal
 */
export const AVRO_RESERVED_NAME_LIST = AVRO_RESERVED_NAMES.join(", ");

/**
 * Tells whether Avro keeps the name for a type of its own.
 *
 * @internal
 */
export function isAvroReservedName(name: string): boolean {
  return AVRO_RESERVED_NAMES.includes(name);
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
