/**
 * Reading the decorator state of the official Protobuf library.
 *
 * The adapter has to know which model the official emitter turned into which
 * `.proto` file. A file name or a message of the same name inside the text
 * answers that wrongly as soon as a package is renamed, a namespace nests, or
 * two packages hold a model of one name. The decorator state answers it
 * exactly, so this adapter reads the state.
 *
 * The state belongs to `@typespec/protobuf` and is not part of its public
 * interface. The library keeps its state symbols in a module the package
 * exports map does not open. The symbols are still reachable, because the
 * compiler builds every state symbol with `Symbol.for`, from the library name
 * and the key. So the same symbol comes back from the global registry.
 *
 * Neither the key names nor the shape behind them is covered by any
 * compatibility promise of that library. This file is the only place that
 * reads them, so an upgrade has one place to check.
 */

import type { Model, Namespace, Program } from "@typespec/compiler";

/** The state key of `@Protobuf.message`, a set of the models that carry it. */
const MESSAGE_STATE = Symbol.for("@typespec/protobuf.message");

/** The state key of `@Protobuf.package`, a map from namespace to its details. */
const PACKAGE_STATE = Symbol.for("@typespec/protobuf.package");

/**
 * The Protobuf package a model belongs to.
 *
 * The name is optional, because `@Protobuf.package` takes its details object
 * optionally and the object takes its name optionally. A package with no name
 * produces a file with no `package` declaration in it.
 *
 * @internal
 */
export interface ProtobufPackage {
  /** The nearest namespace above the model that carries `@Protobuf.package`. */
  readonly namespace: Namespace;
  /** The name the package declares, or `undefined` when it declares none. */
  readonly name: string | undefined;
}

/**
 * Lists every model the author marked with `@Protobuf.message`.
 *
 * These are the models the adapter offers a generated payload for. A model the
 * official emitter converts for another reason, such as one reachable from a
 * Protobuf service, is not one of them. Such a model has no AsyncAPI message
 * of its own to describe.
 *
 * @param program - The compiled program
 * @returns Every model that carries the official decorator
 * @internal
 */
export function listProtobufMessageModels(program: Program): Model[] {
  const models: Model[] = [];
  for (const type of program.stateSet(MESSAGE_STATE)) {
    // The decorator only accepts a model, so every entry is one.
    if (type.kind === "Model") models.push(type);
  }
  return models;
}

/**
 * Finds the package a model belongs to.
 *
 * The search walks up from the namespace of the model and stops at the first
 * namespace that carries `@Protobuf.package`. That is the rule the official
 * emitter follows, so an inner package wins over an outer one.
 *
 * @param program - The compiled program
 * @param model - A model that carries `@Protobuf.message`
 * @returns The nearest package, or `undefined` when no namespace declares one
 * @internal
 */
export function resolveProtobufPackage(
  program: Program,
  model: Model,
): ProtobufPackage | undefined {
  const packages = program.stateMap(PACKAGE_STATE);
  let namespace = model.namespace;
  while (namespace !== undefined) {
    if (packages.has(namespace)) {
      return { namespace, name: packageNameOf(packages.get(namespace)) };
    }
    namespace = namespace.namespace;
  }
  return undefined;
}

/**
 * Reads the name out of the details object of a package.
 *
 * The state holds the argument as the type the author wrote. The name is a
 * string literal property of it, and the official emitter reads it the same
 * way.
 *
 * @param details - The value the decorator stored, if it stored one
 * @returns The declared name, or `undefined` when the author declared none
 */
function packageNameOf(details: unknown): string | undefined {
  const model = details as Model | undefined;
  const name = model?.properties.get("name");
  const value = name?.type;
  return value?.kind === "String" ? value.value : undefined;
}
