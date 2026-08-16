import { Model, Program, getDoc, getSummary } from "@typespec/compiler";
import {
  ChannelRecord,
  ChannelTarget,
  listChannelsInternal,
} from "../../decorators/channels/state.js";
import { listUseServerTargets } from "../../decorators/channels/use-server-state.js";
import { reportDiagnostic } from "../../lib.js";
import { ChannelObject } from "../../types/index.js";
import { buildExternalDocs } from "../external-docs.js";
import { present, text } from "../optional-fields.js";
import { buildTags } from "../tags.js";
import { buildChannelMessages } from "./messages.js";
import { buildChannelParameters } from "./parameters.js";
import { buildChannelServers } from "./servers.js";

/**
 * Builds the root `channels` map.
 *
 * Every channel goes to the root `channels` map. `components.channels`
 * exists in AsyncAPI for a channel that no operation refers to, and this
 * emitter does not use it. A channel declared in TypeSpec is always meant to
 * be part of the application, so hoisting some of them into `components`
 * would only add a level of indirection with no reader benefit. That stays
 * true until reusable components arrive as a whole.
 *
 * The keys come from the decorator: the explicit id argument wins, and
 * otherwise the declaration name of the interface or namespace is used. The
 * name is used unqualified, which follows the `components.messages` key
 * policy rather than the namespace-qualified `components.schemas` one. Two
 * channels that resolve to one key are reported, and the first one in source
 * order keeps the key.
 *
 * @param program - The program to read the channels from
 * @param messageKeys - The key each emitted message model was given, so a
 * channel reference never recomputes a message key
 * @returns The `channels` map. It is empty when the program declares no
 * channel, and the caller emits it anyway, because AsyncAPI requires the
 * field.
 */
export function buildChannels(
  program: Program,
  messageKeys: ReadonlyMap<Model, string>,
): Record<string, ChannelObject> {
  const entries: [string, ChannelObject][] = [];
  const claimedBy = new Set<string>();

  for (const { target, record } of listChannelsInternal(program)) {
    const id = record.state.channelId ?? target.name;
    if (claimedBy.has(id)) {
      reportDiagnostic(program, { code: "duplicate-channel-id", format: { id }, target });
      continue;
    }
    claimedBy.add(id);
    entries.push([id, buildChannel(program, target, record, id, messageKeys)]);
  }

  reportUseServerWithoutChannel(program);

  // The map is built from entries, so an id such as `__proto__` becomes an
  // own property instead of a write to the prototype.
  return Object.fromEntries(entries);
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
 * `tags` merges the built-in `@tag` with this library's `@asyncTag`, the
 * same way a message does. Both decorators reach an interface and a
 * namespace, so a channel needs nothing of its own here.
 *
 * A field with nothing to say is left out. `address` is the exception: it is
 * required, and a dynamic channel emits the literal `null` rather than no
 * field at all, so a reader can tell "the address is unknown" from "the
 * emitter had nothing to say".
 */
function buildChannel(
  program: Program,
  target: ChannelTarget,
  record: ChannelRecord,
  id: string,
  messageKeys: ReadonlyMap<Model, string>,
): ChannelObject {
  return {
    address: record.state.address,
    ...text("title", getSummary(program, target)),
    ...text("description", getDoc(program, target)),
    ...present("servers", buildChannelServers(program, target)),
    ...present("parameters", buildChannelParameters(program, target, record, id)),
    ...present("messages", buildChannelMessages(program, target, id, messageKeys)),
    ...present("tags", buildTags(program, target)),
    ...present("externalDocs", buildExternalDocs(program, target)),
  };
}

/**
 * Reports every `@useServer` that sits on a target with no channel.
 *
 * Only a channel carries a `servers` field, so such an application reaches
 * no part of the document. Dropping it in silence hides an author mistake,
 * so each one names the server it wanted.
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
