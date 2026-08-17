/**
 * The lower half of the channels.
 *
 * It turns resolved nodes into the root `channels` map. Every reference in a
 * channel is written here: a server reference, and a message reference into
 * `components.messages`. A reference is a document detail, so resolve carries
 * only the names it points at.
 *
 * This half reads no decorator state and reports no diagnostic.
 */

import type { ChannelNode, ChannelParameterNode } from "../resolve/service.js";
import { present, text } from "../optional-fields.js";
import { componentsMessageRef, serverRef } from "./json-pointer.js";
import { ChannelObject, ParameterObject, ReferenceObject } from "../types/index.js";
import { lowerBindings } from "./bindings.js";

/** Turns one resolved parameter into a Parameter Object. */
function lowerParameter(node: ChannelParameterNode): ParameterObject {
  return {
    ...present("enum", node.enumValues ? [...node.enumValues] : undefined),
    ...text("default", node.default),
    ...text("description", node.description),
    ...present("examples", node.examples ? [...node.examples] : undefined),
    ...text("location", node.location),
  };
}

/** Turns the resolved parameters of one channel into the `parameters` map. */
function lowerParameters(
  nodes: readonly ChannelParameterNode[],
): Record<string, ParameterObject> | undefined {
  if (nodes.length === 0) return undefined;
  // The map is built from entries, so a name such as `__proto__` becomes an
  // own property instead of a write to the prototype.
  return Object.fromEntries(nodes.map((node) => [node.name, lowerParameter(node)]));
}

/** Turns the resolved messages of one channel into the `messages` map. */
function lowerMessages(node: ChannelNode): Record<string, ReferenceObject> | undefined {
  if (node.messages.length === 0) return undefined;
  return Object.fromEntries(
    node.messages.map((message) => [message.key, { $ref: componentsMessageRef(message.key) }]),
  );
}

/**
 * Builds one Channel Object.
 *
 * The descriptive fields follow the mapping every other object in this
 * emitter uses: `@summary` becomes `title` and `@doc` becomes `description`.
 * AsyncAPI also defines `summary` on a channel, but TypeSpec has no third
 * source of prose, so that field is left out rather than filled with a copy
 * of another one.
 *
 * A field with nothing to say is left out. `address` is the exception: it is
 * required, and a dynamic channel emits the literal `null` rather than no
 * field at all, so a reader can tell "the address is unknown" from "the
 * emitter had nothing to say".
 */
function lowerChannel(node: ChannelNode): ChannelObject {
  return {
    address: node.address,
    ...text("title", node.title),
    ...text("description", node.description),
    ...present(
      "servers",
      node.servers.length > 0 ? node.servers.map((name) => ({ $ref: serverRef(name) })) : undefined,
    ),
    ...present("parameters", lowerParameters(node.parameters)),
    ...present("messages", lowerMessages(node)),
    ...present("bindings", lowerBindings(node.bindings)),
    ...present("tags", node.tags.length > 0 ? structuredClone([...node.tags]) : undefined),
    ...present("externalDocs", node.externalDocs ? { ...node.externalDocs } : undefined),
  };
}

/**
 * Builds the root `channels` map from resolved nodes.
 *
 * The map is emitted even when it is empty, because AsyncAPI requires the
 * field.
 *
 * @param nodes - The resolved channels, in source order
 * @returns The root `channels` map
 * @internal
 */
export function lowerChannels(nodes: readonly ChannelNode[]): Record<string, ChannelObject> {
  // The map is built from entries, so an id such as `__proto__` becomes an
  // own property instead of a write to the prototype.
  return Object.fromEntries(nodes.map((node) => [node.key, lowerChannel(node)]));
}
