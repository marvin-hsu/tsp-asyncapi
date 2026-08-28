/**
 * The `@namespace` decorator and its readers.
 *
 * A TypeSpec namespace carries at most one Avro namespace. This file records
 * that mark and finds the nearest ancestor that carries one. The walk reads
 * the result when it builds a named type's full name. Refusing a type with
 * no covering namespace is the walk's decision, not this file's.
 */

import { DecoratorContext, Model, Enum, Namespace, Program, Scalar } from "@typespec/compiler";
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
 * @param target - The declaration to place. A scalar is one, because `@fixed`
 *   turns a scalar into a named Avro type.
 * @returns The covering name, or undefined when no ancestor declares one
 *
 * @public
 */
export function resolveAvroNamespace(
  program: Program,
  target: Model | Enum | Scalar,
): string | undefined {
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
