import { Model, Operation, Program, getDoc, getSummary } from "@typespec/compiler";
import { OperationStatementNode } from "@typespec/compiler/ast";
import { ChannelTarget } from "../../decorators/channels/state.js";
import { getOperationAction } from "../../decorators/operations/action.js";
import { listReplyDeclarations } from "../../decorators/operations/reply-state.js";
import { OperationActionState, listOperationActions } from "../../decorators/operations/state.js";
import { reportDiagnostic } from "../../lib.js";
import { OperationObject, ReferenceObject } from "../../types.js";
import { buildBindings } from "../bindings/builder.js";
import { BindingPlacements, markBindingsPlaced } from "../../resolve/bindings.js";
import { EmittedChannel } from "../channels/builder.js";
import { owningChannelTarget } from "../channels/scope.js";
import { buildExternalDocs } from "../external-docs.js";
import { channelRef } from "../json-pointer.js";
import { operationSides } from "../operation-models.js";
import { present, text } from "../../optional-fields.js";
import { resolveSecuritySchemeNames } from "../../resolve/servers.js";
import { securitySchemeRef } from "../json-pointer.js";
import { buildTags } from "../tags.js";
import { operationId } from "./id.js";
import { buildMessageReferences } from "./messages.js";
import { buildOperationReply } from "./reply.js";

/**
 * Builds the root `operations` map.
 *
 * Every operation marked with `@send` or `@receive` reaches this map.
 * `components.operations` exists in AsyncAPI for an operation nothing refers
 * to, and this emitter does not use it, the same decision the channel
 * builder makes.
 *
 * The operations are walked in global source order, not grouped by channel.
 * The keys clash across the whole document, so "the first one in source
 * order keeps the key" has to mean one thing for the whole program.
 *
 * The key of each one is resolved by `operationId`. Two operations that
 * resolve to one key are reported, and the first one in source order keeps
 * the key.
 *
 * @param program - The program to read the operations from
 * @param channels - The channel each target contributed, for the targets
 * that emitted one
 * @param messageKeys - The key each emitted message model was given
 * @param declaredSchemes - The keys of `components.securitySchemes`
 * @returns The `operations` map. It is empty when the program declares no
 * operation.
 */
export function buildOperations(
  program: Program,
  channels: ReadonlyMap<ChannelTarget, EmittedChannel>,
  messageKeys: ReadonlyMap<Model, string>,
  declaredSchemes: ReadonlySet<string>,
  placements: BindingPlacements,
): Record<string, OperationObject> {
  const entries: [string, OperationObject][] = [];
  const claimed = new Set<string>();

  const placed = listOperationActions(program).map(({ target, record }) => {
    const owner = owningChannelTarget(target);
    return { target, record, channel: owner === undefined ? undefined : channels.get(owner) };
  });
  const emittedNodes = emittedDeclarationNodes(placed);

  for (const { target, record, channel } of placed) {
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
      continue;
    }

    const id = operationId(target, record);
    if (claimed.has(id)) {
      reportDiagnostic(program, { code: "duplicate-operation-id", format: { id }, target });
      // The repeated id is the mistake, and it is already reported. The
      // bindings of this operation are not a second one.
      markBindingsPlaced(program, "operation", target, placements);
      continue;
    }
    claimed.add(id);
    entries.push([
      id,
      buildOperation(program, {
        operation: target,
        record,
        channel,
        channels,
        messageKeys,
        declaredSchemes,
        placements,
      }),
    ]);
  }

  reportRepliesWithoutAction(program);

  // The map is built from entries, so an id such as `__proto__` becomes an
  // own property instead of a write to the prototype.
  return Object.fromEntries(entries);
}

/** One operation with an action, and the channel it was placed on. */
interface PlacedOperation {
  target: Operation;
  record: OperationActionState;
  channel: EmittedChannel | undefined;
}

/**
 * The declaration node of every operation that reached a channel.
 *
 * `interface C extends Base` copies each operation of `Base` into `C` and
 * runs its decorators again, so the declaration in `Base` is recorded as an
 * operation of its own. That declaration sits on no channel, and reporting it
 * would name a mistake the author did not make. It reaches the document
 * through the copies.
 *
 * A copy keeps the syntax node of the declaration it came from. So the node
 * is what connects the two, and a declaration whose node reached a channel is
 * left alone.
 */
function emittedDeclarationNodes(placed: readonly PlacedOperation[]): Set<OperationStatementNode> {
  const nodes = new Set<OperationStatementNode>();
  for (const { target, channel } of placed) {
    if (channel === undefined || target.node === undefined) continue;
    nodes.add(target.node);
  }
  return nodes;
}

/** Everything one Operation Object is built from. */
interface OperationContext {
  operation: Operation;
  record: OperationActionState;
  channel: EmittedChannel;
  channels: ReadonlyMap<ChannelTarget, EmittedChannel>;
  messageKeys: ReadonlyMap<Model, string>;
  declaredSchemes: ReadonlySet<string>;
  placements: BindingPlacements;
}

/**
 * Builds one Operation Object.
 *
 * The field order follows the Operation Object table of the specification.
 * AsyncAPI also defines `summary` here. It is left out for the reason a
 * channel leaves it out: `@summary` already fills `title` and `@doc` already
 * fills `description`.
 *
 * The two sides of the signature are read by the action. `operationSides`
 * states that rule, and it states it in one place because the channel
 * message collection reads the same rule.
 *
 * A field with nothing to say is left out.
 */
/**
 * The `security` array of one operation, or `undefined` when none survives.
 *
 * Resolve settles which names are real. Turning a name into a reference is a
 * document detail, so it happens here.
 */
function securityReferences(
  program: Program,
  operation: Operation,
  declaredSchemes: ReadonlySet<string>,
): ReferenceObject[] | undefined {
  const names = resolveSecuritySchemeNames(program, operation, declaredSchemes);
  return names.length > 0 ? names.map((name) => ({ $ref: securitySchemeRef(name) })) : undefined;
}

function buildOperation(program: Program, context: OperationContext): OperationObject {
  const { operation, record, channel, channels, messageKeys, declaredSchemes } = context;
  const { request, reply } = operationSides(program, operation, record.action);

  return {
    action: record.action,
    channel: { $ref: channelRef(channel.id) },
    ...text("title", getSummary(program, operation)),
    ...text("description", getDoc(program, operation)),
    ...present("security", securityReferences(program, operation, declaredSchemes)),
    ...present("tags", buildTags(program, operation)),
    ...present("externalDocs", buildExternalDocs(program, operation)),
    ...present("bindings", buildBindings(program, "operation", operation, context.placements)),
    ...present("messages", buildMessageReferences(request, channel, messageKeys)),
    ...present(
      "reply",
      buildOperationReply(program, {
        operation,
        ownChannel: channel,
        channels,
        replyModels: reply,
        requestModels: request,
        messageKeys,
      }),
    ),
  };
}

/**
 * Reports every reply decorator on an operation with no action.
 *
 * A reply sits on an emitted operation, and only `@send` or `@receive` emits
 * one. So such an application reaches no part of the document. Dropping it
 * in silence hides an author mistake.
 */
function reportRepliesWithoutAction(program: Program): void {
  for (const { operation, target } of listReplyDeclarations(program)) {
    if (getOperationAction(program, operation) !== undefined) continue;
    reportDiagnostic(program, { code: "reply-without-action", target });
  }
}
