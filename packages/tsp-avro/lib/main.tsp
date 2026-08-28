import "../dist/src/tsp-index.js";

using TypeSpec.Reflection;

namespace Avro;

/**
 * Declares the Avro namespace of everything inside a TypeSpec namespace.
 * TypeSpec namespaces nest, and Avro namespaces do not, so the nearest
 * ancestor that carries this decorator wins.
 *
 * @param target The namespace this Avro namespace covers.
 * @param name The Avro namespace, such as `com.example.orders`.
 */
extern dec avroNamespace(target: Namespace, name: valueof string);

/**
 * Marks a model as an Avro record to emit.
 * One marked model becomes one `.avsc` file. A model this one reaches is
 * written into that same file.
 *
 * @param target The model to emit.
 */
extern dec avroRecord(target: Model);

/**
 * Declares the names a reader also knows this declaration by.
 * A record, an enum and a fixed type take a full name. A field takes a
 * plain name.
 *
 * @param target The declaration that carries the aliases.
 * @param names The alias names.
 */
extern dec aliases(target: Model | ModelProperty | Enum | Scalar, ...names: valueof string[]);

/**
 * Declares how a reader sorts records by this field.
 * `mode` is `ascending`, `descending`, or `ignore`.
 *
 * @param target The field.
 * @param mode The Avro order.
 */
extern dec order(target: ModelProperty, mode: valueof string);

/**
 * Declares a fixed number of bytes.
 * An Avro fixed type holds exactly that many bytes.
 *
 * @param target The model or scalar that becomes the fixed type.
 * @param size How many bytes, which is a positive number.
 */
extern dec fixed(target: Model | Scalar, size: valueof int32);

/**
 * Declares the meaning Avro reads into an underlying type.
 * Use `@decimal` for `decimal`. It is the one logical type that takes
 * parameters.
 *
 * @param target The scalar or field the meaning belongs to.
 * @param name The logical type name, such as `uuid` or `timestamp-millis`.
 */
extern dec logicalType(target: Scalar | ModelProperty, name: valueof string);

/**
 * Declares a decimal logical type, with its precision and scale.
 *
 * @param target The scalar or field.
 * @param precision How many digits the decimal holds.
 * @param scale How many of those digits sit after the point.
 */
extern dec decimal(target: Scalar | ModelProperty, precision: valueof int32, scale?: valueof int32);

/**
 * Declares the symbol a reader falls back to.
 * The name must be a member this enum declares.
 *
 * @param target The enum the symbol belongs to.
 * @param member The name of a member this enum declares.
 */
extern dec enumDefault(target: Enum, member: valueof string);
