/**
 * The resolve half of the operations.
 *
 * It reads the `@send` and `@receive` state, decides which operations reach
 * the document at all, assigns each one its key, and settles the two things
 * an operation points at: the messages of its request side, and its reply.
 *
 * The lower half writes every reference. Resolve carries only the keys a
 * reference addresses.
 */

import { Model, Operation, Program, getDoc, getSummary } from "@typespec/compiler";
import { ChannelTarget } from "../decorators/channels/state.js";
import { OperationActionState, listOperationActions } from "../decorators/operations/state.js";
import { listReplyDeclarations } from "../decorators/operations/reply-state.js";
import { getOperationAction } from "../decorators/operations/action.js";
import { reportDiagnostic } from "../lib.js";
import { present, text } from "../optional-fields.js";
import { buildExternalDocs } from "../external-docs.js";
import { buildTags } from "./tags.js";
import { resolveExtensions } from "./extensions.js";
import { BindingPlacements, markBindingsPlaced, resolveBindings } from "./bindings.js";
import { EmittedChannel } from "./channels.js";
import { owningChannelTarget } from "./channels/scope.js";
import { operationSides } from "./operation-models.js";
import { operationId } from "./operations/id.js";
import { resolveMessageRefs } from "./operations/messages.js";
import { resolveOperationReply } from "./operations/reply.js";
import { resolveSecuritySchemeNames } from "./servers.js";
import { OperationNode } from "./service.js";

/** One operation, paired with the channel it reached, if any. */
interface PlacedOperation {
  target: Operation;
  record: OperationActionState;
  channel: EmittedChannel | undefined;
}

/**
 * What the resolve half of the operations produces.
 *
 * `extensionCarriers` is wider than the node list. A declaration in a base
 * interface reaches the document through the copy the extending interface
 * holds, and its extensions reach that copy's Operation Object.
 *
 * @internal
 */
export interface ResolvedOperations {
  readonly operations: readonly OperationNode[];
  readonly extensionCarriers: ReadonlySet<Operation>;
}

/**
 * Resolves every operation that `@send` or `@receive` marks.
 *
 * An operation reaches the document through the channel it sits on. One with
 * no such channel reaches nothing, and it is reported unless another
 * declaration already carries it in. A repeated key is reported and dropped,
 * the same rule every other key collision follows.
 *
 * @param placements - Where the binding applications this build placed are
 * recorded
 * @internal
 */
export function resolveOperations(
  program: Program,
  channels: ReadonlyMap<ChannelTarget, EmittedChannel>,
  messageKeys: ReadonlyMap<Model, string>,
  declaredSchemes: ReadonlySet<string>,
  placements: BindingPlacements,
): ResolvedOperations {
  const nodes: OperationNode[] = [];
  const claimed = new Set<string>();
  // Every operation that reached an Operation Object, whether through its own
  // node or a copy that carried the declaration in. The loop registers each
  // one up front, before it knows which branch it will take, so no later
  // report forgets that the document still carries the declaration. The one
  // exception takes itself back out below.
  const extensionCarriers = new Set<Operation>();

  const placed: PlacedOperation[] = listOperationActions(program).map(({ target, record }) => {
    const owner = owningChannelTarget(target);
    return { target, record, channel: owner === undefined ? undefined : channels.get(owner) };
  });
  const emittedNodes = emittedDeclarationNodes(placed);

  for (const { target, record, channel } of placed) {
    extensionCarriers.add(target);
    if (channel === undefined) {
      // The operation points at a channel that reached the document, so one
      // with no such channel reaches nothing. The channel may be missing
      // because the target carries no channel decorator, and it may be
      // missing because the declared channel was dropped.
      if (target.node !== undefined && emittedNodes.has(target.node)) {
        // The copies carry this declaration into the document, so its
        // bindings reached an object too.
        markBindingsPlaced(program, "operation", target, placements);
        continue;
      }
      reportDiagnostic(program, {
        code: "operation-without-channel",
        format: { name: target.name },
        target,
      });
      // This is the one operation that reaches no object at all, so it is
      // the one whose extensions really are unplaced.
      extensionCarriers.delete(target);
      continue;
    }

    const key = operationId(target, record);
    if (claimed.has(key)) {
      reportDiagnostic(program, { code: "duplicate-operation-id", format: { id: key }, target });
      // The repeated key is the mistake, and it is already reported. The
      // bindings of this operation are not a second one.
      markBindingsPlaced(program, "operation", target, placements);
      continue;
    }
    claimed.add(key);

    const { request, reply } = operationSides(program, target, record.action);
    const replyNode = resolveOperationReply(program, {
      operation: target,
      ownChannel: channel,
      channels,
      replyModels: reply,
      requestModels: request,
      messageKeys,
    });

    nodes.push({
      target,
      key,
      action: record.action,
      channelKey: channel.id,
      ...text("title", getSummary(program, target)),
      ...text("description", getDoc(program, target)),
      security: resolveSecuritySchemeNames(program, target, declaredSchemes),
      tags: buildTags(program, target) ?? [],
      ...present("externalDocs", buildExternalDocs(program, target)),
      bindings: resolveBindings(program, "operation", target, placements),
      messages: resolveMessageRefs(request, channel, messageKeys),
      ...present("reply", replyNode),
      extensions: resolveExtensions(program, target),
    });
  }

  reportRepliesWithoutAction(program);

  return { operations: nodes, extensionCarriers };
}

/**
 * The declaration nodes that reached the document through a copy of
 * themselves.
 *
 * An operation declared in a base interface is reached through
 * `interface C extends Base`. The compiler makes one operation per extending
 * interface, and each copy shares the declaration node of the original. The
 * original itself sits on no channel, so it would otherwise be reported as
 * reaching nothing.
 */
function emittedDeclarationNodes(placed: readonly PlacedOperation[]): ReadonlySet<object> {
  const nodes = new Set<object>();
  for (const { target, channel } of placed) {
    if (channel !== undefined && target.node !== undefined) nodes.add(target.node);
  }
  return nodes;
}

/**
 * Reports every reply decorator on an operation that carries no action.
 *
 * A reply belongs to an operation, and an operation reaches the document only
 * through `@send` or `@receive`. So a reply decorator beside neither has
 * nowhere to go and changes nothing.
 */
function reportRepliesWithoutAction(program: Program): void {
  for (const { operation, target } of listReplyDeclarations(program)) {
    if (getOperationAction(program, operation) !== undefined) continue;
    reportDiagnostic(program, { code: "reply-without-action", target });
  }
}
