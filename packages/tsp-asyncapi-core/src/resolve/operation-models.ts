/**
 * The message models one operation signature names.
 *
 * Two folders need this walk. A channel collects the messages of every
 * operation it owns. An operation splits the same models by direction, so
 * one side becomes `messages` and the other becomes `reply.messages`. So the
 * walk belongs to neither folder and sits here, next to the other modules
 * two folders share.
 */

import { Model, Operation, Program, Type } from "@typespec/compiler";
import { ChannelTarget } from "../decorators/channels/state.js";
import { listMessages } from "../decorators/index.js";
import { getOperationAction } from "../decorators/operations/action.js";
import {
  getReplyChannelInternal,
  listOperationsReplyingOver,
} from "../decorators/operations/reply-state.js";
import { OperationAction } from "../decorators/operations/state.js";
import { bySourcePosition, sourcePositionOf } from "../source-order.js";
import { channelOperations } from "../resolve/channels/scope.js";

/**
 * The models of one operation signature, split by side.
 *
 * A `@send` operation sends what its parameters name and receives what its
 * return type names. A `@receive` operation is the inverse.
 */
interface OperationSignatureModels {
  /** The models the top-level parameters name. */
  parameters: Model[];
  /** The models the return type names. */
  returns: Model[];
}

/**
 * Lists the models of each side of one operation signature, in source order.
 *
 * The walk covers the type of each top-level parameter and the return type.
 * It unwraps a union into its variants, and it unwraps the element type of
 * an `Array<T>` or a `Record<T>`.
 *
 * The walk does not go into the properties of a model. A model nested inside
 * a payload is payload data, not a second message on the channel. So a
 * `@message` marked deeper down is left where it is.
 *
 * Each side removes its own repeats. A model both sides name reaches both
 * lists, because the two sides describe two different directions.
 */
function operationSignatureModels(
  program: Program,
  operation: Operation,
): OperationSignatureModels {
  const messages = listMessages(program);
  const parameters: Model[] = [];
  const seenParameters = new Set<Model>();
  for (const property of operation.parameters.properties.values()) {
    collectInto(parameters, seenParameters, unwrap(property.type, messages, new Set<Type>()));
  }
  const returns: Model[] = [];
  collectInto(returns, new Set<Model>(), unwrap(operation.returnType, messages, new Set<Type>()));
  return { parameters, returns };
}

/**
 * The models of one operation signature, split by direction.
 *
 * This is what the two sides of the signature mean, rather than where they
 * were written.
 */
export interface OperationSides {
  /** The models the operation carries in the direction of its action. */
  request: Model[];
  /** The models of its reply, which travels the other way. */
  reply: Model[];
}

/**
 * Splits one operation signature into its request side and its reply side.
 *
 * This is the one place the AsyncAPI direction rule is written. A `send`
 * operation sends what its parameters name and receives its reply through the
 * return type. A `receive` operation is the inverse.
 *
 * Two callers need the rule: the operation builder, and the channel message
 * collection when `@replyChannel` sends the reply elsewhere. A second
 * spelling would let them state opposite directions for one operation.
 */
export function operationSides(
  program: Program,
  operation: Operation,
  action: OperationAction,
): OperationSides {
  const { parameters, returns } = operationSignatureModels(program, operation);
  return action === "send"
    ? { request: parameters, reply: returns }
    : { request: returns, reply: parameters };
}

/**
 * Lists every model an operation could carry as a message, in source order.
 *
 * The two sides of the signature are joined here, and a model that both
 * sides name contributes one entry.
 */
function operationModels(program: Program, operation: Operation): Model[] {
  const { parameters, returns } = operationSignatureModels(program, operation);
  const found: Model[] = [];
  const seen = new Set<Model>();
  collectInto(found, seen, parameters);
  collectInto(found, seen, returns);
  return found;
}

/**
 * Lists the models one operation puts on one channel, in source order.
 *
 * A channel carries the messages that travel over it. Both sides of the
 * signature travel over the channel of the operation in the usual case, so
 * both sides land here.
 *
 * `@replyChannel` is the exception. It sends the reply over another channel,
 * so the reply side never reaches the channel of the operation. Listing it
 * there would say a message travels somewhere it never goes, and a code
 * generator would build a consumer for it on the wrong address. The reply
 * side reaches the named channel instead, and `channelMessageModels` puts it
 * there.
 *
 * The split needs the action, because the action decides which side is the
 * reply. An operation with no action emits no operation object, so no reply
 * is derived from it either. Both sides of such an operation stay on the
 * channel, and its messages still reach the document.
 */
function operationChannelModels(
  program: Program,
  operation: Operation,
  channel: ChannelTarget,
): Model[] {
  const action = getOperationAction(program, operation)?.action;
  const replyChannel = getReplyChannelInternal(program, operation)?.channel;
  if (action === undefined || replyChannel === undefined || replyChannel === channel) {
    return operationModels(program, operation);
  }
  return operationSides(program, operation, action).request;
}

/**
 * Lists every model one channel carries as a message, in source order.
 *
 * Two groups of operations put a message on a channel. The first group is the
 * operations the channel owns, and each of them contributes what
 * `operationChannelModels` gives it. The second group sits on other channels
 * and names this one with `@replyChannel`, and each of those contributes its
 * reply side.
 *
 * The second group exists because AsyncAPI requires `reply.messages` to be a
 * subset of the messages of the reply channel. The reply travels over that
 * channel, so the channel must carry it.
 *
 * A replying operation with no action contributes nothing here. Such an
 * operation emits no operation object, so it emits no reply either, and both
 * sides of it stay on its own channel.
 *
 * The owned operations come first, and the replies from elsewhere follow.
 * Each group is in source order. A model that two operations name contributes
 * one entry, and the first contributor decides where it sits.
 */
export function channelMessageModels(program: Program, target: ChannelTarget): Model[] {
  const found: Model[] = [];
  const seen = new Set<Model>();
  for (const operation of channelOperations(program, target)) {
    collectInto(found, seen, operationChannelModels(program, operation, target));
  }
  for (const operation of replyingOperations(program, target)) {
    const action = getOperationAction(program, operation)?.action;
    if (action === undefined) continue;
    collectInto(found, seen, operationSides(program, operation, action).reply);
  }
  return found;
}

/**
 * Lists the operations that send their reply over one channel, in source
 * order.
 *
 * The state map hands them over in the order the decorators ran. Every
 * diagnostic about a message key names "the first one in source order" as the
 * winner, so the order is restored here rather than taken on trust.
 */
function replyingOperations(program: Program, target: ChannelTarget): Operation[] {
  const compare = bySourcePosition(program);
  return listOperationsReplyingOver(program, target).sort((a, b) =>
    compare(sourcePositionOf(a), sourcePositionOf(b)),
  );
}

/** Appends the models the list does not already hold. */
function collectInto(found: Model[], seen: Set<Model>, models: Model[]): void {
  for (const model of models) {
    if (seen.has(model)) continue;
    seen.add(model);
    found.push(model);
  }
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
 * The visited set spans one walk, not one branch of it. A model that two
 * branches both reach contributes once, which is what the caller wants
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
