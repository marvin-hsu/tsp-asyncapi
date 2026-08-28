/**
 * The `servers` array of one channel.
 *
 * It reads the channel's `@useServer` applications, in source order, and the
 * set of server names the document declares.
 *
 * It decides which server names the channel is available on, dropping a
 * repeat and a name no `@server` declares.
 *
 * The lower half turns each name into a Reference Object. This module
 * carries only the name.
 */

import { Program } from "@typespec/compiler";
import { ChannelTarget } from "../../decorators/channels/state.js";
import { getUsedServers } from "../../decorators/index.js";
import { reportDiagnostic } from "../../lib.js";
import { orderBySourceNodes } from "../../source-order.js";

/**
 * Builds the `servers` array of one channel from its `@useServer`
 * applications.
 *
 * The array holds references into the root `servers` map. AsyncAPI requires
 * a Reference Object here, so no Server Object is ever inlined.
 *
 * The order is source order. The recorded state does not preserve it,
 * because the compiler records applications in the order they ran, which
 * differs between a decorator written inline and an augment decorator.
 *
 * A name given twice contributes one reference. AsyncAPI requires the
 * entries of this array to be unique, and the repeat is reported so it is
 * not dropped in silence.
 *
 * A name no `@server` declares is reported and dropped. The reference it
 * would emit addresses a key the document does not carry, and the official
 * parser rejects the whole document over one. The check runs here rather
 * than in the decorator, because a `@server` can arrive after `@useServer`
 * runs.
 *
 * @returns The `servers` array, or `undefined` when the channel names no
 * server. The caller then leaves the field out, which AsyncAPI reads as
 * "available on every server".
 */
export function resolveChannelServers(
  program: Program,
  target: ChannelTarget,
  declaredServers: ReadonlySet<string>,
): readonly string[] {
  const recorded = getUsedServers(program, target);
  if (recorded.length === 0) return [];

  const ordered = orderBySourceNodes(
    program,
    recorded.map((entry) => entry.node),
    recorded,
  );

  const claimed = new Set<string>();
  const names: string[] = [];
  for (const entry of ordered) {
    if (claimed.has(entry.name)) {
      reportDiagnostic(program, {
        code: "duplicate-use-server",
        format: { name: entry.name },
        target: entry.node,
      });
      continue;
    }
    claimed.add(entry.name);
    if (!declaredServers.has(entry.name)) {
      reportDiagnostic(program, {
        code: "undeclared-used-server",
        format: { name: entry.name },
        target: entry.node,
      });
      continue;
    }
    // Only the name is carried. Turning it into a reference is a document
    // detail, so the lower half does it.
    names.push(entry.name);
  }
  return names;
}
