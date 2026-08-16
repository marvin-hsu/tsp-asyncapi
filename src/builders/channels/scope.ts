/**
 * What one channel owns.
 *
 * A channel owns the operations declared directly inside the interface or
 * namespace it sits on. A nested interface, and a namespace nested inside a
 * namespace, are separate scopes. Each of them may carry a channel of its
 * own, so collecting them here would put one operation on two channels and
 * would let one namespace-level channel absorb everything under it.
 *
 * The messages collection and the parameters collection both walk this
 * scope, so the rule has one definition here.
 */

import { Model, Operation, Program, Type } from "@typespec/compiler";
import { ChannelTarget } from "../../decorators/channel-state.js";
import { listMessages } from "../../decorators/index.js";
import { bySourcePosition, sourcePositionOf } from "../../source-order.js";

/**
 * Lists the operations one channel owns, in source order.
 *
 * The compiler records the members of an interface or a namespace in a map
 * whose order is not guaranteed to be source order. Every diagnostic below
 * names "the first one in source order" as the winner, so the order is
 * restored here rather than taken on trust.
 *
 * @param program - The program the channel belongs to
 * @param target - The interface or namespace that carries the channel
 * @returns The operations declared directly inside it, in source order
 */
export function channelOperations(program: Program, target: ChannelTarget): Operation[] {
  const compare = bySourcePosition(program);
  return [...target.operations.values()].sort((a, b) =>
    compare(sourcePositionOf(a), sourcePositionOf(b)),
  );
}

/**
 * Lists every model an operation could carry as a message, in source order.
 *
 * The walk covers the type of each top-level parameter and the return type.
 * It unwraps a union into its variants, and it unwraps the element type of
 * an `Array<T>` or a `Record<T>`.
 *
 * The walk does not go into the properties of a model. A model nested inside
 * a payload is payload data, not a second message on the channel. So a
 * `@message` marked deeper down is left where it is.
 *
 * @param program - The program the operation belongs to
 * @param operation - The operation to walk
 * @returns Every model the operation names, with repeats removed
 */
export function operationModels(program: Program, operation: Operation): Model[] {
  const found: Model[] = [];
  const seen = new Set<Model>();
  const collect = (type: Type): void => {
    for (const model of unwrapModels(program, type)) {
      if (seen.has(model)) continue;
      seen.add(model);
      found.push(model);
    }
  };
  for (const property of operation.parameters.properties.values()) {
    collect(property.type);
  }
  collect(operation.returnType);
  return found;
}

/**
 * Unwraps one type into the models it carries at the surface.
 *
 * A model marked `@message` contributes itself and stops the walk. A union
 * contributes each of its variants. An array or a record contributes its
 * element type. Any other model contributes itself. Anything that is not a
 * model contributes nothing.
 *
 * The `@message` check comes first, so a message declared as `model Bag is
 * Record<string>` stays the message it is marked as. Without that order the
 * walk would unwrap it to `string` and the channel would lose the message.
 */
export function unwrapModels(program: Program, type: Type): Model[] {
  return unwrap(type, listMessages(program), new Set<Type>());
}

/**
 * Walks one type, and keeps the types it has already walked.
 *
 * A TypeSpec declaration may name itself. `model Tree is Array<Tree>` and
 * `union U { u: U }` are both legal, and the schema layer emits a `$ref`
 * back to the declaration for each of them. So the walk must end on a type
 * it reaches a second time. A repeat contributes nothing, because the first
 * visit already contributed everything the type carries.
 *
 * The visited set spans the whole walk, not one branch of it. A model that
 * two branches both reach contributes once, which is what the caller wants
 * anyway.
 */
function unwrap(type: Type, messages: ReadonlyMap<Model, unknown>, visited: Set<Type>): Model[] {
  if (visited.has(type)) return [];
  visited.add(type);
  if (type.kind === "Union") {
    return [...type.variants.values()].flatMap((variant) =>
      unwrap(variant.type, messages, visited),
    );
  }
  if (type.kind === "Model") {
    if (messages.has(type)) return [type];
    const element = collectionElement(type);
    if (element !== undefined) return unwrap(element, messages, visited);
    return [type];
  }
  return [];
}

/**
 * Returns the element type of an `Array<T>` or a `Record<T>`, and
 * `undefined` for any other model.
 * The compiler backs both templates with an indexer, and the value of that
 * indexer is the element type. A model with properties of its own is not one
 * of the two, so its own indexer, if any, is left alone.
 */
function collectionElement(model: Model): Type | undefined {
  if (model.indexer === undefined) return undefined;
  if (model.properties.size > 0) return undefined;
  return model.indexer.value;
}
