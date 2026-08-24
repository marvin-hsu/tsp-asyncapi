/**
 * The resolve half of the bindings.
 *
 * This half reads the recorded applications, orders them, decides which one
 * wins a repeated protocol, and reports every application that reached
 * nothing. What it produces is a list of `BindingNode`, which says which
 * protocol the member is named after and what the renderer will be given.
 *
 * The lower half turns those nodes into the Bindings Object. It names no
 * decorator and reads no state.
 */

import { Program, Type } from "@typespec/compiler";
import {
  BindingEntry,
  EmittedBindingLevel,
  listAllBindings,
  listBindings,
} from "../decorators/bindings/state.js";
import { reportDiagnostic } from "../lib.js";
import { bySourcePosition } from "../source-order.js";
import { BindingNode, JsonObject } from "./service.js";

/**
 * The name of the declaration a binding was applied to, when it has one.
 *
 * A namespace, an interface, an operation and a model all carry a name. An
 * anonymous target carries none, and then the component that shares this
 * binding is named after the first site instead.
 */
function carrierOf(target: Type): string | undefined {
  if (!("name" in target) || typeof target.name !== "string" || target.name.length === 0) {
    return undefined;
  }
  return target.name;
}

/**
 * The applications one build placed, and the record of which they were.
 *
 * The record used to be a flag on the entry, and an entry lives in program
 * state, so it outlived the build that set it. Emitting one document per
 * version, or per service, resolves one program more than once, and the
 * earlier build's answer would then stand in for the current one.
 *
 * A build owns one of these and passes it explicitly. Two builds of one
 * program cannot see each other's.
 *
 * @internal
 */
export class BindingPlacements {
  readonly #placed = new Set<BindingEntry>();

  /**
   * Records that one application reached the object it belongs on.
   *
   * A binding dropped as a repeated protocol counts as placed. It did reach
   * the object, and the clash was already reported. Leaving it out would
   * report it a second time as reaching nothing, which is untrue.
   */
  public place(entry: BindingEntry): void {
    this.#placed.add(entry);
  }

  /** Tells whether this build placed `entry`. */
  public has(entry: BindingEntry): boolean {
    return this.#placed.has(entry);
  }
}

/**
 * The bindings of one target that belong to one document position.
 *
 * A level takes its own bindings and the level-less ones. Both `resolve` and
 * `markBindingsPlaced` need the same filter, so the filter has one definition.
 */
function applicableBindings(
  program: Program,
  level: EmittedBindingLevel,
  target: Type,
): readonly BindingEntry[] {
  return listBindings(program, target).filter(
    (entry) => entry.level === level || entry.level === "any",
  );
}

/**
 * Resolves the bindings of one server, channel, operation, or message.
 *
 * Two buckets reach one level. The first holds the bindings a
 * protocol-specific decorator recorded for exactly this level. The second
 * holds the bindings the generic `@binding` recorded, which name no level and
 * land wherever their target emits an object.
 *
 * The nodes keep source order, so the emitted document is the same on every
 * run and reads in the order the author wrote the decorators.
 *
 * One protocol claims one member. A second claim on the same level is
 * reported and dropped, which is how `@binding("kafka", ...)` beside
 * `@kafkaChannel` is caught. The two are never merged. The first in source
 * order keeps the member, the same rule `duplicate-schema-key` and
 * `duplicate-channel-id` follow.
 *
 * A level takes its own bindings and the level-less ones, and nothing else.
 * The filter matters because one namespace can be both the service namespace
 * and a channel. `@kafkaServer` and `@kafkaChannel` then sit on one target and
 * both name the protocol `kafka`. They are two members of two different
 * objects, not a repeated protocol.
 *
 * @param program - The program to read the bindings from
 * @param level - The document position being resolved
 * @param target - The type that carries the decorators
 * @param placements - Where the applications this build placed are recorded
 * @returns The nodes, in source order. An empty list means the target carries
 * no binding for this level.
 * @internal
 */
export function resolveBindings(
  program: Program,
  level: EmittedBindingLevel,
  target: Type,
  placements: BindingPlacements,
): readonly BindingNode[] {
  const applicable = applicableBindings(program, level, target);
  if (applicable.length === 0) return [];

  const ordered = [...applicable].sort(bySourcePosition(program));

  const nodes: BindingNode[] = [];
  const claimed = new Set<string>();
  for (const entry of ordered) {
    // Every entry here reached this object, so it counts as placed even when
    // the next check drops it. The stray report asks whether a binding
    // reached an object at all, not whether it was rendered.
    placements.place(entry);
    if (claimed.has(entry.protocol)) {
      reportDiagnostic(program, {
        code: "duplicate-binding",
        format: { protocol: entry.protocol, level },
        target: entry.node,
      });
      continue;
    }
    claimed.add(entry.protocol);
    const carrier = carrierOf(entry.target);
    nodes.push({
      protocol: entry.protocol,
      renderer: entry.renderer,
      // The state value is handed on as it stands. The renderers treat it as
      // read-only, and the lower half copies whatever it writes into the
      // document.
      config: entry.config as JsonObject,
      ...(carrier !== undefined ? { carrier } : {}),
    });
  }
  return nodes;
}

/**
 * Records that one target reached its document position, without resolving.
 *
 * A builder drops a target on paths that emit no object and still are not a
 * stray binding. There are two such paths.
 *
 * The first is a target that reaches the document by another route. An
 * operation declared in a base interface is reached through
 * `interface C extends Base`, and the declaration itself sits on no channel.
 * `emittedDeclarationNodes` already suppresses `operation-without-channel`
 * for it, and its bindings need the same answer.
 *
 * The second is a target the builder dropped and reported. A repeated channel
 * id, operation id, or message key each names the mistake exactly. A second
 * report about the binding would send the author after a decorator the target
 * already carries, and the binding is not the mistake.
 *
 * Without this call the stray report would compute its own, weaker answer to
 * a question four builders already answered.
 *
 * @param program - The program to read the bindings from
 * @param level - The document position the target was building
 * @param target - The type that carries the decorators
 * @param placements - Where the applications this build placed are recorded
 * @internal
 */
export function markBindingsPlaced(
  program: Program,
  level: EmittedBindingLevel,
  target: Type,
  placements: BindingPlacements,
): void {
  for (const entry of applicableBindings(program, level, target)) placements.place(entry);
}

/**
 * Reports every binding that reached no object.
 *
 * A binding sits on the object its target emits. So a `@kafkaOperation` on an
 * operation with no action, a `@kafkaMessage` on a model with no `@message`,
 * a `@kafkaChannel` on a plain interface, and a `@kafkaServer` on a namespace
 * that declares no server all have nowhere to go. Each one is silent unless
 * it is reported here.
 *
 * Call it once the whole document is built. Anything `placements` does not
 * hold by then had every chance to be placed.
 *
 * The reports come out in source order. The state layer hands them over in
 * the order the decorators ran, which is not the order the author reads.
 *
 * @param program - The program to read the bindings from
 * @param placements - What this build placed
 * @internal
 */
export function reportUnattachedBindings(program: Program, placements: BindingPlacements): void {
  const stray = listAllBindings(program).filter((entry) => !placements.has(entry));
  stray.sort(bySourcePosition(program));
  for (const entry of stray) {
    reportDiagnostic(program, {
      code: "binding-outside-document",
      messageId: entry.level === "any" ? "anyLevel" : "default",
      format: { protocol: entry.protocol, level: entry.level },
      target: entry.node,
    });
  }
}
