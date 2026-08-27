/**
 * How an Avro full name goes together, and how it comes apart.
 *
 * Avro names a record, an enum and a fixed type by a namespace and a name with
 * a dot between them. A definition writes the two halves apart, and every
 * reference to it writes them joined, so the walk does both, in more than one
 * place. The rule is here so those places cannot drift.
 */

/**
 * Joins a namespace and a name into an Avro full name.
 *
 * A type with no namespace is named by its name alone. Nothing this package
 * writes is in that position, because a record with no Avro namespace above it
 * is refused. The rule is here all the same, because the schema type says the
 * namespace is optional. An `"undefined.Name"` would be a name a reader looks
 * up and never finds.
 *
 * @param namespace - The Avro namespace, or undefined when the type has none
 * @param name - The Avro name
 * @returns The full name
 *
 * @internal
 */
export function avroFullName(namespace: string | undefined, name: string): string {
  return namespace === undefined ? name : `${namespace}.${name}`;
}

/**
 * Splits the namespace back off a full name.
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
