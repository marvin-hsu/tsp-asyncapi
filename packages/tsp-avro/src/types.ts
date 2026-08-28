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
 * A schema spells a primitive by name alone. The list is the one source of
 * these names in the package. The type comes from it, the name rules read it
 * to refuse a named type that takes one, and the logical type rules read it
 * to tell a primitive from a reference to a named type.
 *
 * @public
 */
export const AVRO_PRIMITIVE_NAMES = [
  "null",
  "boolean",
  "int",
  "long",
  "float",
  "double",
  "bytes",
  "string",
] as const;

/**
 * One Avro primitive type name.
 *
 * @public
 */
export type AvroPrimitiveName = (typeof AVRO_PRIMITIVE_NAMES)[number];

/**
 * A value an Avro field may carry as its default.
 *
 * It is the JSON value the Avro specification allows there, and nothing
 * wider. The walk builds it from a TypeSpec default, and the compiler hands
 * that over as `unknown`, so the one cast that narrows it lives at that call.
 *
 * @public
 */
export type AvroDefault =
  | null
  | boolean
  | number
  | string
  | readonly AvroDefault[]
  | { readonly [key: string]: AvroDefault };

/**
 * How a reader sorts records by one field.
 *
 * @public
 */
export type AvroFieldOrder = "ascending" | "descending" | "ignore";

/**
 * One field of an Avro record.
 *
 * @public
 */
export interface AvroField {
  /** The field name. */
  readonly name: string;
  /** The field's schema. */
  readonly type: AvroSchema;
  /** The field's documentation. */
  readonly doc?: string;
  /**
   * Avro allows null as a default, and undefined here means the field has
   * none. So the two are apart: `null` is written, `undefined` disappears.
   */
  readonly default?: AvroDefault;
  /** Other names a reader may know this field by. */
  readonly aliases?: readonly string[];
  /** How a reader sorts records by this field. */
  readonly order?: AvroFieldOrder;
}

/**
 * An Avro record.
 *
 * @public
 */
export interface AvroRecord {
  /** The Avro type keyword. */
  readonly type: "record";
  /** The record's unqualified name. */
  readonly name: string;
  /** The namespace that qualifies the name. */
  readonly namespace?: string;
  /** The record's documentation. */
  readonly doc?: string;
  /** Other full names a reader may know this record by. */
  readonly aliases?: readonly string[];
  /** In declaration order. */
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
  /** The enum's unqualified name. */
  readonly name: string;
  /** The namespace that qualifies the name. */
  readonly namespace?: string;
  /** The enum's documentation. */
  readonly doc?: string;
  /** Other full names a reader may know this enum by. */
  readonly aliases?: readonly string[];
  /** In declaration order. */
  readonly symbols: readonly string[];
  /** The symbol a reader falls back to when it meets one it does not hold. */
  readonly default?: string;
}

/**
 * An Avro fixed type: a named type of a stated number of bytes.
 *
 * @public
 */
export interface AvroFixed {
  /** The Avro type keyword. */
  readonly type: "fixed";
  /** The type's unqualified name. */
  readonly name: string;
  /** The namespace that qualifies the name. */
  readonly namespace?: string;
  /** Other full names a reader may know this type by. */
  readonly aliases?: readonly string[];
  /** Width, in bytes. */
  readonly size: number;
  /** The meaning a reader takes from those bytes. */
  readonly logicalType?: string;
  /** How many digits a decimal holds. */
  readonly precision?: number;
  /** How many of those digits sit after the point. */
  readonly scale?: number;
}

/**
 * A primitive, with the meaning Avro reads into it.
 *
 * A logical type is an attribute of a type rather than a type of its own. Avro
 * writes `{"type": "long", "logicalType": "timestamp-millis"}`, and a reader
 * that does not know the annotation reads the `long`. So the annotation never
 * changes what is on the wire.
 *
 * A fixed type carries the same attribute, and {@link AvroFixed} holds it
 * there for the same reason: the specification writes the annotation on the
 * type, not around it.
 *
 * Precision and scale belong to `decimal` alone.
 *
 * @public
 */
export interface AvroLogical {
  /** The type that is on the wire. */
  readonly type: AvroPrimitiveName;
  /** The meaning a reader takes from it. */
  readonly logicalType: string;
  /** How many digits a decimal holds. */
  readonly precision?: number;
  /** How many of those digits sit after the point. */
  readonly scale?: number;
}

/**
 * An Avro array.
 *
 * @public
 */
export interface AvroArray {
  /** The Avro type keyword. */
  readonly type: "array";
  /** The schema every item holds. */
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
  /** The schema every value holds. */
  readonly values: AvroSchema;
}

/**
 * Any Avro schema except a union.
 *
 * This is what a union branch may be, and the type says so: Avro forbids a
 * union inside a union, and {@link AvroUnion} is built from this.
 *
 * @public
 */
export type AvroBranch =
  string | AvroRecord | AvroEnum | AvroFixed | AvroArray | AvroMap | AvroLogical;

/**
 * An Avro union.
 *
 * Avro spells a union as a JSON array and gives it no keyword of its own.
 * That array may not hold another array, and it may not name one type twice.
 * The walk holds both rules, so anything here is already flat and already free
 * of repeats.
 *
 * @public
 */
export type AvroUnion = readonly AvroBranch[];

/**
 * Any Avro schema this package produces.
 *
 * @public
 */
export type AvroSchema = AvroBranch | AvroUnion;

/**
 * Tells an Avro union from every other schema.
 *
 * Avro gives a union no keyword. It is a JSON array, and that array is the
 * only member of {@link AvroSchema} spelled as one.
 *
 * @public
 */
export function isAvroUnion(schema: AvroSchema): schema is AvroUnion {
  return Array.isArray(schema);
}

/**
 * The keywords Avro names its complex types with.
 *
 * No primitive is spelled any of these, which is what makes the `type` member
 * of a schema object say which member of {@link AvroBranch} it is.
 */
const AVRO_KEYWORDS: ReadonlySet<string> = new Set(["record", "enum", "fixed", "array", "map"]);

/**
 * Tells an annotated primitive from every other schema.
 *
 * An annotated primitive is spelled as an object, like a record or an array,
 * and its `type` holds a primitive name rather than a keyword. That is the
 * whole difference, and it is enough: the two sets of names do not meet.
 *
 * A fixed type carries an annotation too, and it is not this: it is a named
 * type first, and the annotation is one more member of it.
 *
 * @public
 */
export function isAvroLogical(schema: AvroBranch): schema is AvroLogical {
  return typeof schema !== "string" && !AVRO_KEYWORDS.has(schema.type);
}
