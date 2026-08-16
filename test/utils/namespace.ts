import { Namespace, Program } from "@typespec/compiler";

/**
 * Finds one top-level namespace of a compiled program by name.
 *
 * Most tests take the namespace from a `t.namespace` marker instead. A
 * marker needs the source to be one template, so a test that compiles a set
 * of files cannot use one. This reads the same namespace from the program.
 *
 * @param program - The compiled program
 * @param name - The name of the namespace, directly under the global one
 * @returns The namespace
 * @throws When the program declares no namespace with that name
 */
export function namespaceOf(program: Program, name: string): Namespace {
  const namespace = program.getGlobalNamespaceType().namespaces.get(name);
  if (namespace === undefined) {
    throw new Error(`The compiled program declares no namespace named '${name}'.`);
  }
  return namespace;
}
