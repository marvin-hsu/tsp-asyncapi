/**
 * The one place a `bindings` object is assembled.
 *
 * AsyncAPI puts a Bindings Object on four objects, and each of them holds the
 * same shape: one member per protocol. So collecting the applications,
 * ordering them, rejecting a repeated protocol, and rendering each one is one
 * decision, and it is made here. A builder makes a single call and spreads
 * the result into its own object. No builder names a protocol, writes a
 * `bindingVersion`, or merges two applications.
 *
 * This sits beside `buildTags`, `buildExternalDocs` and
 * `buildSecurityRequirements`, the other decisions four builders share.
 */

import { Program, Type } from "@typespec/compiler";
import {
  BindingEntry,
  BindingRenderer,
  EmittedBindingLevel,
  listAllBindings,
  listBindings,
  markBindingConsumed,
} from "../../decorators/bindings/state.js";
import { reportDiagnostic } from "../../lib.js";
import { bySourcePosition } from "../../source-order.js";
import { BindingObject, BindingsObject } from "../../types/index.js";
import { renderKafkaBinding } from "./kafka.js";

/**
 * The renderer of each recorded binding, by name.
 *
 * The decorators record a renderer name rather than a function, so the state
 * layer never imports a builder. This map is the other half of that split.
 * A new protocol adds a file under this folder and an entry here. It changes
 * no builder.
 *
 * Each renderer returns the object of its own protocol. Those types are
 * interfaces, and an interface carries no index signature, so the value type
 * stays the wider `object` and `render` narrows the result once.
 *
 * The key type is the `BindingRenderer` union itself. So a name added to the
 * union and forgotten here fails the build, rather than reaching `render` as
 * an undefined function and throwing while a document is emitted.
 */
const RENDERERS: Record<BindingRenderer, (config: unknown) => object> = {
  // The generic `@binding` already holds plain JSON, and it is emitted as
  // written. Nothing is added to it, `bindingVersion` included.
  verbatim: (config) => config as BindingObject,
  // One name covers all four Kafka levels. Each decorator records its fields
  // under the names the document uses, so the rendering is the same at every
  // level.
  kafka: renderKafkaBinding,
};

/**
 * Builds the `bindings` object of one server, channel, operation, or message.
 *
 * Two buckets reach one level. The first holds the bindings a
 * protocol-specific decorator recorded for exactly this level. The second
 * holds the bindings the generic `@binding` recorded, which name no level and
 * therefore land wherever their target emits an object.
 *
 * The members keep source order, so the emitted document is the same on every
 * run and reads in the order the author wrote the decorators.
 *
 * One protocol claims one member. A second claim on the same level is
 * reported and dropped, which is how `@binding("kafka", ...)` beside
 * `@kafkaChannel` is caught. The two are never merged, and the later one
 * never wins. The first one in source order keeps the member, the same rule
 * `duplicate-schema-key` and `duplicate-channel-id` follow.
 *
 * This is the only place that decision is made. The state layer records
 * every application and rejects none, so one rule picks the winner and the
 * `duplicate-binding` message describes that one rule.
 *
 * A level takes its own bindings and the level-less ones, and nothing else.
 * The filter matters because one namespace can be both the service namespace
 * and a channel. `@kafkaServer` and `@kafkaChannel` then sit on one target
 * and both name the protocol `kafka`. They are two members of two different
 * objects, not a repeated protocol.
 *
 * @param program - The program to read the bindings from
 * @param level - The document position being built
 * @param target - The type that carries the decorators
 * @returns The `bindings` object, or `undefined` when the target carries
 * none. The caller then omits the field, because an empty Bindings Object
 * states nothing.
 */
export function buildBindings(
  program: Program,
  level: EmittedBindingLevel,
  target: Type,
): BindingsObject | undefined {
  const applicable = applicableBindings(program, level, target);
  if (applicable.length === 0) return undefined;

  const compare = bySourcePosition(program);
  const ordered = [...applicable].sort(compare);

  const entries: [string, BindingObject][] = [];
  const claimed = new Set<string>();
  for (const entry of ordered) {
    // Every entry here reached this object, so it counts as placed even when
    // the next check drops it. `reportUnattachedBindings` asks whether a
    // binding reached an object at all, not whether it was rendered.
    markBindingConsumed(entry);
    if (claimed.has(entry.protocol)) {
      reportDiagnostic(program, {
        code: "duplicate-binding",
        format: { protocol: entry.protocol, level },
        target: entry.node,
      });
      continue;
    }
    claimed.add(entry.protocol);
    entries.push([entry.protocol, render(entry)]);
  }

  // The object is built from entries. A protocol name is written by the
  // author, so a name such as `__proto__` becomes an own key instead of a
  // write to the prototype.
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * The bindings of one target that belong to one document position.
 *
 * A level takes its own bindings and the level-less ones. `buildBindings`
 * renders them, and `markBindingsPlaced` accounts for them without rendering.
 * Both need the same filter, so the filter has one definition.
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
 * Records that one target reached its document position, without rendering.
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
 * The second is a target the builder dropped and reported. A repeated
 * channel id, operation id, or message key each names the mistake exactly.
 * A second report about the binding would send the author after a decorator
 * the target already carries, and the binding is not the mistake.
 *
 * Without this call `reportUnattachedBindings` would compute its own, weaker
 * answer to a question four builders already answered.
 *
 * @param program - The program to read the bindings from
 * @param level - The document position the target was building
 * @param target - The type that carries the decorators
 * @internal
 */
export function markBindingsPlaced(
  program: Program,
  level: EmittedBindingLevel,
  target: Type,
): void {
  for (const entry of applicableBindings(program, level, target)) markBindingConsumed(entry);
}

/**
 * Runs the renderer one entry named.
 *
 * The result is a Bindings Object member, which is an open map of fields. The
 * renderers describe their own field sets with interfaces, and an interface
 * has no index signature, so the widening happens here once.
 */
function render(entry: BindingEntry): BindingObject {
  const renderer = RENDERERS[entry.renderer];
  return renderer(entry.config) as BindingObject;
}

/**
 * Reports every binding that reached no object.
 *
 * A binding sits on the object its target emits. So a `@kafkaOperation` on an
 * operation with no action, a `@kafkaMessage` on a model with no `@message`,
 * a `@kafkaChannel` on a plain interface, and a `@kafkaServer` on a namespace
 * that declares no server all change nothing at all. Dropping them in silence
 * hides an author mistake, which is why `use-security-outside-server` exists
 * for the same shape of problem.
 *
 * One function covers all four levels, because the builder marks what it
 * consumed while it assembles. Four per-level checks would each have to
 * rebuild the set of emitted objects.
 *
 * Call it once the whole document is built. Anything still unconsumed then
 * had every chance to be placed.
 *
 * The reports come out in source order. The state layer hands them over in
 * the order the decorators ran, which is not the order the author reads.
 * `listSecurityUsesWithoutServer` sorts its own stray records for the same
 * reason.
 *
 * @param program - The program to read the bindings from
 */
export function reportUnattachedBindings(program: Program): void {
  const stray = listAllBindings(program).filter((entry) => !entry.consumed);
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
