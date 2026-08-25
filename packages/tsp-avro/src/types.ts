/**
 * The intermediate structure the walk produces.
 *
 * It is Avro shaped on purpose. Every member here is a field the Avro
 * specification names, so rendering is a key ordering pass and nothing more.
 * There is no printer, because an Avro schema is JSON.
 *
 * A schema is either a string or an object. The string carries two different
 * meanings that Avro spells the same way: a primitive type name, and a
 * reference to a named type defined earlier in the same schema. Nothing here
 * separates them, because nothing downstream needs them apart.
 */

/**
 * The Avro primitive type names.
 *
 * @public
 */
export type AvroPrimitiveName =
  "null" | "boolean" | "int" | "long" | "float" | "double" | "bytes" | "string";

/**
 * One field of an Avro record.
 *
 * @public
 */
export interface AvroField {
  /** The field name. */
  readonly name: string;
  /** The type of the field. */
  readonly type: AvroSchema;
  /** The documentation of the field. */
  readonly doc?: string;
}

/**
 * An Avro record.
 *
 * @public
 */
export interface AvroRecord {
  /** The Avro type keyword. */
  readonly type: "record";
  /** The unqualified name of the record. */
  readonly name: string;
  /** The namespace that qualifies the name. */
  readonly namespace?: string;
  /** The documentation of the record. */
  readonly doc?: string;
  /** The fields, in declaration order. */
  readonly fields: readonly AvroField[];
}

/**
 * An Avro enum.
 *
 * @public
 */
export interface AvroEnum {
  /** The Avro type keyword. */
  readonly type: "enum";
  /** The unqualified name of the enum. */
  readonly name: string;
  /** The namespace that qualifies the name. */
  readonly namespace?: string;
  /** The documentation of the enum. */
  readonly doc?: string;
  /** The symbols, in declaration order. */
  readonly symbols: readonly string[];
}

/**
 * An Avro array.
 *
 * @public
 */
export interface AvroArray {
  /** The Avro type keyword. */
  readonly type: "array";
  /** The type of every item. */
  readonly items: AvroSchema;
}

/**
 * An Avro map. Its keys are always strings.
 *
 * @public
 */
export interface AvroMap {
  /** The Avro type keyword. */
  readonly type: "map";
  /** The type of every value. */
  readonly values: AvroSchema;
}

/**
 * Any Avro schema this package produces.
 *
 * @public
 */
export type AvroSchema = string | AvroRecord | AvroEnum | AvroArray | AvroMap;
