import { Program } from "@typespec/compiler";
import { ChannelTarget } from "../../decorators/channels/state.js";
import { getUsedServers } from "../../decorators/index.js";
import { reportDiagnostic } from "../../lib.js";
import { ReferenceObject } from "../../types.js";
import { serverRef } from "../json-pointer.js";
import { orderBySourceNodes } from "../../source-order.js";

/**
 * Builds the `servers` array of one channel from its `@useServer`
 * applications.
 *
 * The array holds references into the root `servers` map. AsyncAPI requires
 * a Reference Object here, so no Server Object is ever inlined.
 *
 * The order is source order, which the recorded state does not carry: the
 * compiler records the applications in the order they ran, and that differs
 * between a decorator written inline and an augment decorator.
 *
 * A name given twice contributes one reference. AsyncAPI requires the
 * entries of this array to be unique, and the repeat is reported so it is
 * not dropped in silence.
 *
 * @returns The `servers` array, or `undefined` when the channel names no
 * server. The caller then leaves the field out, which AsyncAPI reads as
 * "available on every server".
 */
export function buildChannelServers(
  program: Program,
  target: ChannelTarget,
): ReferenceObject[] | undefined {
  const recorded = getUsedServers(program, target);
  if (recorded.length === 0) return undefined;

  const ordered = orderBySourceNodes(
    program,
    recorded.map((entry) => entry.node),
    recorded,
  );

  const claimed = new Set<string>();
  const references: ReferenceObject[] = [];
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
    references.push({ $ref: serverRef(entry.name) });
  }
  return references;
}
