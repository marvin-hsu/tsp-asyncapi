/**
 * How an Avro full name goes together, and how it comes apart.
 *
 * A named type (record, enum, fixed) has a namespace and a name joined by a
 * dot. A definition writes the two halves apart, and every reference joins
 * them, so the walk needs both directions in more than one place. Centralizing
 * the rule here keeps those places from drifting apart.
 */

/**
 * Joins a namespace and a name into an Avro full name.
 *
 * A type with no namespace is named by its name alone. This package never
 * writes that case, because a record with no Avro namespace is refused. The
 * rule still lives here, because the schema type allows an empty namespace,
 * and the alternative is a name like `"undefined.Name"` no reader can find.
 *
 * {@link avroNamespaceOf} treats an empty namespace the same way, so the two
 * functions invert each other.
 *
 * @param namespace - The Avro namespace, or undefined or empty when the type
 *   has none
 * @param name - The Avro name
 * @returns The full name
 *
 * @internal
 */
export function avroFullName(namespace: string | undefined, name: string): string {
  return namespace === undefined || namespace === "" ? name : `${namespace}.${name}`;
}

/**
 * Splits the namespace back off a full name built by {@link avroFullName}.
 *
 * @param fullName - A full name {@link avroFullName} built
 * @returns The namespace, which is empty when the full name carries none
 *
 * @internal
 */
export function avroNamespaceOf(fullName: string): string {
  const dot = fullName.lastIndexOf(".");
  return dot < 0 ? "" : fullName.slice(0, dot);
}
