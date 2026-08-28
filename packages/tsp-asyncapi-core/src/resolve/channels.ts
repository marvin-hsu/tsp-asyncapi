/**
 * The resolve half of the channels.
 *
 * It reads the `@channel` state, assigns each channel its key in the root
 * `channels` map, and settles the three things a channel is made of besides
 * its own prose: the servers it is available on, the parameters of its
 * address, and the messages it carries.
 *
 * The lower half turns those nodes into Channel Objects. Every reference in
 * the output is written there, because a `$ref` is a document detail rather
 * than a fact about the program.
 */

import { Model, Program, getDoc, getSummary } from "@typespec/compiler";
import { ChannelTarget, listChannelsInternal } from "../decorators/channels/state.js";
import { listUseServerTargets } from "../decorators/channels/use-server-state.js";
import { listMessages } from "../decorators/index.js";
import { reportDiagnostic } from "../lib.js";
import { present, text } from "../optional-fields.js";
import { buildExternalDocs } from "../external-docs.js";
import { buildTags } from "./tags.js";
import { resolveExtensions } from "./extensions.js";
import { BindingPlacements, markBindingsPlaced, resolveBindings } from "./bindings.js";
import { resolveChannelMessages } from "./channels/messages.js";
import { resolveChannelParameters } from "./channels/parameters.js";
import { resolveChannelServers } from "./channels/servers.js";
import { ChannelNode } from "./service.js";

/**
 * One channel that reached the document.
 *
 * The operations resolver needs all three fields. The key builds the
 * reference that points at the channel. The message keys build the reference
 * that points at one message of it. The address decides whether a reply may
 * carry an address of its own, because AsyncAPI allows that only on a channel
 * whose address is `null`.
 *
 * @internal
 */
export interface EmittedChannel {
  /** The key of this channel in the emitted `channels` map. */
  id: string;
  /** The address it was emitted with. It is `null` for a dynamic channel. */
  address: string | null;
  /** The key this channel gave each message model it carries. */
  messageKeys: ReadonlyMap<Model, string>;
}

/**
 * What the channel resolver hands to the rest of the pipeline.
 *
 * `extensionCarriers` is wider than `emitted`. A target an id collision
 * dropped reached the Channel Object the id names, through the target that
 * claimed it.
 */
export interface ResolvedChannels {
  readonly channels: readonly ChannelNode[];
  readonly emitted: ReadonlyMap<ChannelTarget, EmittedChannel>;
  readonly extensionCarriers: ReadonlySet<ChannelTarget>;
}

/**
 * Resolves every `@channel` the program declares.
 *
 * Every channel goes to the root `channels` map. `components.channels` exists
 * in AsyncAPI for a channel no operation refers to, and this emitter does not
 * use it. A channel declared in TypeSpec is always meant to be part of the
 * application, so hoisting some of them into `components` would add a level
 * of indirection with no reader benefit.
 *
 * A repeated id is reported and the later channel is dropped, the same rule
 * every other key collision in this emitter follows.
 *
 * @param program - The program to read the channels from
 * @param messageKeys - The `components.messages` key each model claimed
 * @param placements - Where the binding applications this build placed are
 * recorded
 * @param declaredServers - The name of every server the document holds. A
 * `@useServer` outside that set names nothing a reference can address.
 * @returns The channels in source order, and the channel each target
 * contributed
 * @internal
 */
export function resolveChannels(
  program: Program,
  messageKeys: ReadonlyMap<Model, string>,
  placements: BindingPlacements,
  declaredServers: ReadonlySet<string>,
): ResolvedChannels {
  const channels: ChannelNode[] = [];
  const claimedBy = new Set<string>();
  const emitted = new Map<ChannelTarget, EmittedChannel>();
  // Every target this loop sees reached the channel its id names, whether it
  // claimed the id itself or the target that claimed it stood in for it. The
  // extension report reads this set, so a dropped target raises no warning
  // about an id the document does carry.
  const extensionCarriers = new Set<ChannelTarget>();
  // The parameter resolver only asks whether a type carries `@message`, and
  // the answer is the same for every channel. `listMessages` copies the whole
  // state map and sorts it by source position, so it is read once here rather
  // than once per channel.
  const messageModels = new Set(listMessages(program).keys());

  for (const { target, record } of listChannelsInternal(program)) {
    extensionCarriers.add(target);
    // The address doubles as the default key. With a broker such as Kafka,
    // the address is the topic name, and the topic name is what a reader
    // looks the channel up by. Only a dynamic channel has no address, so
    // only there the declaration name steps in.
    const key = record.state.channelId ?? record.state.address ?? target.name;
    if (claimedBy.has(key)) {
      reportDiagnostic(program, { code: "duplicate-channel-id", format: { id: key }, target });
      // The repeated id is the mistake, and it is already reported. The
      // bindings of this channel are not a second one.
      markBindingsPlaced(program, "channel", target, placements);
      continue;
    }
    claimedBy.add(key);

    const messages = resolveChannelMessages(program, target, key, messageKeys);
    channels.push({
      target,
      key,
      address: record.state.address,
      ...text("title", getSummary(program, target)),
      ...text("description", getDoc(program, target)),
      servers: resolveChannelServers(program, target, declaredServers),
      parameters: resolveChannelParameters(program, target, record, key, messageModels),
      messages: messages.messages,
      messageKeys: messages.keys,
      tags: buildTags(program, target) ?? [],
      ...present("externalDocs", buildExternalDocs(program, target)),
      bindings: resolveBindings(program, "channel", target, placements),
      extensions: resolveExtensions(program, target),
    });
    emitted.set(target, { id: key, address: record.state.address, messageKeys: messages.keys });
  }

  reportUseServerWithoutChannel(program);
  reportDuplicateAddresses(program, channels);

  return { channels, emitted, extensionCarriers };
}

/**
 * Reports two channels that carry one address.
 *
 * AsyncAPI allows it. The two channels have different ids, so the document
 * is valid, and each one names its own messages. What a reader cannot tell
 * is which set of messages the address actually carries, because the address
 * is the thing that exists at run time and the id is not.
 *
 * A dynamic channel is excluded. Its address is `null` because the address is
 * unknown until run time, so two of them state nothing about each other.
 *
 * Only the second channel of a pair is reported, and it names the first. One
 * mistake gets one report.
 */
function reportDuplicateAddresses(program: Program, channels: readonly ChannelNode[]): void {
  const byAddress = new Map<string, ChannelNode>();
  for (const channel of channels) {
    if (channel.address === null) continue;
    const first = byAddress.get(channel.address);
    if (first === undefined) {
      byAddress.set(channel.address, channel);
      continue;
    }
    reportDiagnostic(program, {
      code: "duplicate-channel-address",
      format: { id: channel.key, other: first.key, address: channel.address },
      target: channel.target,
    });
  }
}

/**
 * Reports every `@useServer` that sits on a target with no channel.
 *
 * Only a channel carries a `servers` field, so such an application reaches no
 * part of the document. Dropping it in silence hides an author mistake, so
 * each one names the server it wanted.
 */
function reportUseServerWithoutChannel(program: Program): void {
  const channels = new Set(listChannelsInternal(program).map(({ target }) => target));
  for (const [target, recorded] of listUseServerTargets(program)) {
    if (channels.has(target)) continue;
    for (const entry of recorded) {
      reportDiagnostic(program, {
        code: "use-server-without-channel",
        format: { name: entry.name },
        target: entry.node,
      });
    }
  }
}
