/**
 * The lower half of the operations.
 *
 * It turns resolved nodes into the root `operations` map, and writes every
 * reference an operation carries: the channel it sits on, each message of its
 * request side, the channel of its reply, and each message of that reply.
 *
 * This half reads no decorator state and reports no diagnostic. Which
 * operations reach the document, and which security scheme names survived,
 * were both settled in resolve.
 */

import type { MessageRefNode, OperationNode, OperationReplyNode } from "../resolve/service.js";
import { present, text } from "../optional-fields.js";
import { channelMessageRef, channelRef, securitySchemeRef } from "../builders/json-pointer.js";
import { OperationObject, OperationReplyObject, ReferenceObject } from "../types.js";
import { lowerBindings } from "./bindings.js";

/** Turns resolved message keys into references into a channel's `messages`. */
function lowerMessageRefs(nodes: readonly MessageRefNode[]): ReferenceObject[] | undefined {
  if (nodes.length === 0) return undefined;
  return nodes.map((node) => ({ $ref: channelMessageRef(node.channelKey, node.messageKey) }));
}

/** Turns one resolved reply into an Operation Reply Object. */
function lowerReply(node: OperationReplyNode): OperationReplyObject {
  return {
    ...present("address", node.address ? { ...node.address } : undefined),
    channel: { $ref: channelRef(node.channelKey) },
    ...present("messages", lowerMessageRefs(node.messages)),
  };
}

/**
 * Builds one Operation Object.
 *
 * The field order follows the Operation Object table of the specification.
 */
function lowerOperation(node: OperationNode): OperationObject {
  return {
    action: node.action,
    channel: { $ref: channelRef(node.channelKey) },
    ...text("title", node.title),
    ...text("description", node.description),
    ...present(
      "security",
      node.security.length > 0
        ? node.security.map((name) => ({ $ref: securitySchemeRef(name) }))
        : undefined,
    ),
    ...present("tags", node.tags.length > 0 ? structuredClone([...node.tags]) : undefined),
    ...present("externalDocs", node.externalDocs ? { ...node.externalDocs } : undefined),
    ...present("bindings", lowerBindings(node.bindings)),
    ...present("messages", lowerMessageRefs(node.messages)),
    ...present("reply", node.reply ? lowerReply(node.reply) : undefined),
  };
}

/**
 * Builds the root `operations` map from resolved nodes.
 *
 * @param nodes - The resolved operations, in source order
 * @returns The root `operations` map
 * @internal
 */
export function lowerOperations(nodes: readonly OperationNode[]): Record<string, OperationObject> {
  // The map is built from entries, so a key such as `__proto__` becomes an
  // own property instead of a write to the prototype.
  return Object.fromEntries(nodes.map((node) => [node.key, lowerOperation(node)]));
}
