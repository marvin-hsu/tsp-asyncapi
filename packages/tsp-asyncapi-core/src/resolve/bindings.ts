/**
 * The resolve half of the bindings.
 *
 * It reads the recorded applications, orders them, decides which one wins a
 * repeated protocol, and reports every application that reached nothing. It
 * produces a list of `BindingNode`, naming the protocol and the config the
 * renderer receives.
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
 *
 * @param target - The type the decorator was applied to
 */
function carrierOf(target: Type): string | undefined {
  if (!("name" in target) || typeof target.name !== "string" || target.name.length === 0) {
    return undefined;
  }
  return target.name;
}

/**
 * Tracks which binding applications one build placed.
 *
 * Program state outlives a single build. One program can resolve more than
 * once, for one document per version or per service. Without a fresh
 * instance, an earlier build's answer would leak into the current one. Each
 * build owns its own instance and passes it explicitly.
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
 *
 * @param program - The program to read the state from
 * @param level - The document level this binding belongs to
 * @param target - The type the decorator was applied to
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
 * A level's bindings are the ones a protocol-specific decorator recorded for
 * exactly that level, plus the level-less ones the generic `@binding`
 * recorded. Nodes keep source order, so the emitted document is stable and
 * matches how the author wrote the decorators.
 *
 * One protocol claims one member. A second claim on the same level is
 * reported and dropped rather than merged. The first in source order wins,
 * following the same rule as `duplicate-schema-key` and
 * `duplicate-channel-id`.
 *
 * The level filter matters when one namespace is both the service namespace
 * and a channel. `@kafkaServer` and `@kafkaChannel` then sit on one target
 * and name the same protocol, but they belong to two different objects, not
 * a repeated protocol.
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
 * Some targets emit no object but are still not a stray binding. One case is
 * a declaration reached only through `interface C extends Base`, which
 * `emittedDeclarationNodes` already excludes from `operation-without-channel`.
 * The other is a target the builder already dropped and reported, for
 * example a repeated channel id, operation id, or message key. The binding
 * itself is not the mistake there.
 *
 * Without this call, `reportUnattachedBindings` would treat both cases as
 * stray.
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
 * A binding sits on the object its target emits. Four cases have nowhere to
 * go. A `@kafkaOperation` can have no action. A `@kafkaMessage` can sit on a
 * model with no `@message`. A `@kafkaChannel` can sit on a plain interface. A
 * `@kafkaServer` can sit on a namespace with no server. Each stays silent
 * unless reported here.
 *
 * Call it once the whole document is built, so every binding had its chance
 * to be placed. Reports come out in source order, not the state layer's
 * decorator-run order.
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
