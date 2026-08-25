import { DecoratorContext, Model, Enum, Namespace, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { reportDiagnostic } from "../lib.js";
import { isAvroNamespace } from "./names.js";

const namespaceStateKey = Symbol.for("tsp-avro.namespace");

const [getNamespaceInternal, setNamespaceInternal] = useStateMap<Namespace, string>(
  namespaceStateKey,
);

/**
 * Declares the Avro namespace of everything inside a TypeSpec namespace.
 *
 * Avro puts a type's namespace in the type itself, and the emitter writes each
 * record to a directory that spells the namespace out. TypeSpec namespaces
 * nest, and Avro namespaces do not, so the nearest ancestor that carries this
 * decorator wins.
 *
 * A name that breaks the Avro rules is reported here, at the place the author
 * wrote it, and nothing is recorded.
 *
 * @param context - The decorator context
 * @param target - The namespace this Avro namespace covers
 * @param name - The Avro namespace, such as `com.example.orders`
 *
 * @example
 * ```typespec
 * @namespace("com.example.orders")
 * namespace Orders {
 *   @record model OrderPlaced { id: string; }
 * }
 * ```
 *
 * @public
 */
export function $namespace(context: DecoratorContext, target: Namespace, name: string): void {
  if (!isAvroNamespace(name)) {
    reportDiagnostic(context.program, {
      code: "invalid-name",
      messageId: "namespace",
      format: { name },
      target: context.decoratorTarget,
    });
    return;
  }
  setNamespaceInternal(context.program, target, name);
}

/**
 * Reads the Avro namespace declared directly on a TypeSpec namespace.
 *
 * @param program - The program to read the state from
 * @param target - The namespace to read
 * @returns The declared name, or undefined when the namespace carries none
 *
 * @public
 */
export function getAvroNamespace(program: Program, target: Namespace): string | undefined {
  return getNamespaceInternal(program, target);
}

/**
 * Finds the Avro namespace that covers a type.
 *
 * It walks up from the type's own namespace and stops at the first one that
 * declares a name. A type with no declared namespace above it has none, and
 * the caller refuses it.
 *
 * @param program - The program to read the state from
 * @param target - The model or enum to place
 * @returns The covering name, or undefined when no ancestor declares one
 *
 * @public
 */
export function resolveAvroNamespace(program: Program, target: Model | Enum): string | undefined {
  let scope = target.namespace;
  while (scope) {
    const name = getNamespaceInternal(program, scope);
    if (name !== undefined) {
      return name;
    }
    scope = scope.namespace;
  }
  return undefined;
}
