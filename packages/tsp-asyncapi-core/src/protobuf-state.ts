/**
 * Reading the decorator state of the official Protobuf library.
 *
 * The author writes the official decorators, and this emitter renders the
 * proto3 text itself. It needs the package and the message name each model
 * takes, and the decorator state holds both.
 *
 * This is the only place that reads that state. The emitter renders payloads
 * from it, and a linter rule asks whether a message carries the official
 * decorators at all. It sits here, in the package that owns the input
 * language, rather than beside either caller.
 *
 * The state belongs to `@typespec/protobuf` and is not part of its public
 * interface. The library keeps its state symbols in a module its exports map
 * does not open, but every symbol comes from `Symbol.for` with the library
 * name and the key, so the global registry still returns it.
 *
 * Neither the key names nor their shape carries any compatibility promise
 * from that library. This file is the only place that reads them, so an
 * upgrade has one place to check.
 */

import {
  getFriendlyName,
  isTemplateInstance,
  type Enum,
  type Model,
  type ModelProperty,
  type Namespace,
  type Program,
  type Type,
} from "@typespec/compiler";
import { capitalize } from "@typespec/compiler/casing";

/** The state key of `@Protobuf.message`, a set of the models that carry it. */
const MESSAGE_STATE = Symbol.for("@typespec/protobuf.message");

/** The state key of `@Protobuf.package`, a map from namespace to its details. */
const PACKAGE_STATE = Symbol.for("@typespec/protobuf.package");

/**
 * The Protobuf package a model belongs to.
 *
 * The name is optional, because `@Protobuf.package` takes its details object
 * optionally and the object takes its name optionally. A package with no name
 * produces proto3 text with no `package` declaration in it.
 *
 * @internal
 */
export interface ProtobufPackage {
  /** Marks details this reader understands. */
  readonly kind: "declared";
  /** The nearest namespace above the model that carries `@Protobuf.package`. */
  readonly namespace: Namespace;
  /** The name the package declares, or `undefined` when it declares none. */
  readonly name: string | undefined;
}

/**
 * A package whose stored details have a shape this reader does not know.
 *
 * The state belongs to another library, and that library promises nothing
 * about its shape. A reader that answered `undefined` here would say "this
 * package declares no name", and proto3 text with no `package` line gives
 * every message in it the wrong fully qualified name. So the two answers stay
 * apart, and the caller refuses this one.
 *
 * @internal
 */
export interface UnreadableProtobufPackage {
  /** Marks details this reader does not understand. */
  readonly kind: "unreadable";
  /** The namespace that carries `@Protobuf.package`. */
  readonly namespace: Namespace;
}

/**
 * Lists every model the author marked with `@Protobuf.message`.
 *
 * These are the models the adapter offers a generated payload for. A model the
 * official emitter converts for another reason, such as one reachable from a
 * Protobuf service, is not one of them. Such a model has no AsyncAPI message
 * of its own to describe.
 *
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

/** The answer of the name reader when the details have an unknown shape. */
const UNREADABLE = Symbol("unreadable package details");

/**
 * Finds the package a model belongs to.
 *
 * The search walks up from the namespace of the model and stops at the first
 * namespace that carries `@Protobuf.package`. That is the rule the official
 * emitter follows, so an inner package wins over an outer one.
 *
 * @param type - A declaration the walk reached. An enum belongs to a package
 *   the same way a model does, so both are read here.
 * @returns The nearest package, that package marked unreadable when its
 *   details have an unknown shape, or `undefined` when no namespace declares
 *   one
 * @internal
 */
export function resolveProtobufPackage(
  program: Program,
  type: Model | Enum,
): ProtobufPackage | UnreadableProtobufPackage | undefined {
  const packages = program.stateMap(PACKAGE_STATE);
  let namespace = type.namespace;
  while (namespace !== undefined) {
    if (packages.has(namespace)) {
      const name = packageNameOf(packages.get(namespace));
      if (name === UNREADABLE) return { kind: "unreadable", namespace };
      return { kind: "declared", namespace, name };
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
 * way. Details the author left out mean a package with no name.
 *
 * Every other shape is unreadable. A details object that is not a model, or a
 * name that is not a string literal, is a shape this reader does not know.
 * Reading it as "no name" would guess, and this reader does not guess.
 *
 * @param details - The value the decorator stored, if it stored one
 * @returns The declared name, `undefined` when the author declared none, or
 *   `UNREADABLE` when the shape is one this reader does not know
 */
function packageNameOf(details: unknown): string | undefined | typeof UNREADABLE {
  if (details === undefined) return undefined;
  const model = details as Partial<Model>;
  if (model.kind !== "Model") return UNREADABLE;
  const name = model.properties?.get("name");
  if (name === undefined) return undefined;
  return name.type.kind === "String" ? name.type.value : UNREADABLE;
}

/**
 * The name the official emitter gives a model's proto message.
 *
 * This mirrors the pinned version's `getModelName`: a friendly name wins,
 * and a plain model is its own name, both capitalized. It exists so the
 * artifact of a model can point at that model's message inside the rendered
 * text, and it is the naming half of what the upgrade gate re-checks.
 *
 * A template instantiation is refused rather than mirrored. Upstream builds
 * its name from the template arguments, and a wrong guess here would silently
 * annotate another message. Refusing keeps the model on the JSON Schema path
 * with a diagnostic, which a later change can lift deliberately.
 *
 * @param model - A model that carries `@Protobuf.message`
 * @returns The message name, or `undefined` for a template instantiation
 * @internal
 */
export function protoMessageNameOf(program: Program, model: Model): string | undefined {
  const friendly = getFriendlyName(program, model);
  if (friendly) return capitalize(friendly);
  if (isTemplateInstance(model)) return undefined;
  return capitalize(model.name);
}

/** The state key of `@Protobuf.field`, a map from property to its number. */
const FIELD_INDEX_STATE = Symbol.for("@typespec/protobuf.fieldIndex");

/** The state key of `@Protobuf.externRef`, a map from type to its import. */
const EXTERN_REF_STATE = Symbol.for("@typespec/protobuf.externRef");

/** The state key that marks a `Protobuf.Map` instantiation. */
const MAP_STATE = Symbol.for("@typespec/protobuf._map");

/** The state key of `@Protobuf.reserve`, a map from model to its reservations. */
const RESERVE_STATE = Symbol.for("@typespec/protobuf.reserve");

/**
 * The field number `@Protobuf.field` recorded for one property.
 *
 * The value is returned as it was stored. Deciding whether it is a number a
 * proto3 field may take belongs to the caller that writes the field.
 *
 * @returns What the decorator stored, or `undefined` when it carries none
 * @internal
 */
export function protobufFieldIndexOf(program: Program, property: ModelProperty): unknown {
  return program.stateMap(FIELD_INDEX_STATE).get(property) as unknown;
}

/**
 * Whether a type is an `@Protobuf.externRef`, which names a declaration of
 * another file.
 *
 * @returns Whether the decorator marked it
 * @internal
 */
export function isProtobufExternRef(program: Program, type: Type): boolean {
  return program.stateMap(EXTERN_REF_STATE).has(type);
}

/**
 * Whether a type is an instantiation of `Protobuf.Map`.
 *
 * @returns Whether the library marked it
 * @internal
 */
export function isProtobufMap(program: Program, type: Type): boolean {
  return program.stateSet(MAP_STATE).has(type);
}

/**
 * What `@Protobuf.reserve` recorded for one model.
 *
 * The value is returned as it was stored, for the same reason the field
 * number is: what a reservation may hold is the writer's rule.
 *
 * @returns What the decorator stored, or `undefined` when it carries none
 * @internal
 */
export function protobufReservationsOf(program: Program, model: Model): unknown {
  return program.stateMap(RESERVE_STATE).get(model) as unknown;
}
