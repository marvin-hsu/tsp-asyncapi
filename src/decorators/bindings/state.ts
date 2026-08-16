/**
 * Where every binding application is recorded.
 *
 * AsyncAPI puts a Bindings Object on four objects: a server, a channel, an
 * operation, and a message. One protocol contributes at most one member to
 * each of them. So the identity of a binding is the triple of the document
 * level, the target type, and the protocol name.
 *
 * The level has to be stored, because the target type alone cannot say it.
 * `@kafkaServer` and `@kafkaChannel` both accept a `Namespace`, so two
 * applications on one namespace belong to two different document positions.
 *
 * The generic `@binding` names no level. It records the level `any`, and the
 * builder merges that bucket into whichever level it was asked for.
 */

import { DecoratorContext, DiagnosticTarget, Program, Type } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { SourcePosition, isSameApplication, sourcePositionOf } from "../../source-order.js";

const bindingStateKey = Symbol.for("tsp-asyncapi.binding");

/**
 * The document position one binding belongs to.
 *
 * `any` is the level the generic `@binding` records. It is not a position of
 * its own. It means "whichever position this target reaches".
 */
type BindingLevel = "any" | "server" | "channel" | "operation" | "message";

/**
 * The four positions that actually carry a Bindings Object.
 * @internal
 */
export type EmittedBindingLevel = Exclude<BindingLevel, "any">;

/**
 * Which function turns a recorded config into the emitted object.
 *
 * The decorators record data, and the builders render it. A renderer name
 * keeps those two apart. The state layer never imports a builder, and the
 * builder never has to know which decorator wrote an entry.
 *
 * One protocol needs one name, however many levels it covers. The four Kafka
 * decorators record their fields under the names the document uses, so the
 * level changes the fields and not the rendering. The level is already stored
 * in `level`, and that is the field every reader of it uses.
 *
 * The builder maps this union to functions, so a new name here without a new
 * entry there is a compile error.
 * @internal
 */
export type BindingRenderer = "verbatim" | "kafka";

/**
 * One recorded binding application.
 * @internal
 */
export interface BindingEntry extends SourcePosition {
  /** The document position this binding belongs to. */
  level: BindingLevel;
  /** The type the decorator was applied to. */
  target: Type;
  /** The member name inside the emitted Bindings Object, such as `kafka`. */
  protocol: string;
  /** The function that renders `config`. */
  renderer: BindingRenderer;
  /** The recorded configuration, in the shape the renderer expects. */
  config: unknown;
  /** Where a problem with this application is reported. */
  node: DiagnosticTarget;
  /**
   * Whether this entry reached an emitted object.
   *
   * The builder sets it while it assembles. It sets it for a binding it
   * dropped as a repeated protocol too. Such a binding did reach the object,
   * and it was already reported as a clash. Leaving it unset would report it
   * a second time, as a binding that reaches nothing, which is untrue.
   *
   * Everything still unset once the whole document is built reached no
   * object at all, and is reported once.
   */
  consumed: boolean;
}

const [getEntries, setEntries, getEntryMap] = useStateMap<Type, BindingEntry[]>(bindingStateKey);

/**
 * Records one binding application.
 *
 * This function decides nothing. It only writes down what the author wrote.
 * One protocol claims one member of a Bindings Object, and the builder makes
 * that decision on the assembled list. Deciding it here as well would need a
 * second winner rule, and the two rules drifted apart: this layer sees
 * decorator execution order, and the builder sees source order. So the rule
 * lives in one place, and `buildBindings` is that place.
 *
 * For the same reason this function does not use `singleApplication`. That
 * guard answers "did this decorator already run on this target", which is a
 * question about one decorator. A binding clash spans several decorators,
 * because `@binding("kafka", ...)` claims the member `@kafkaChannel` claims.
 *
 * A repeated run of one application is not a second application. An augment
 * decorator runs once per declaration of its target, so one `@@kafkaChannel`
 * runs again for every reopened namespace block. The source position is the
 * identity that separates the two cases. Recording such a rerun twice would
 * make the builder report a clash the author never wrote.
 *
 * @param context - The decorator context
 * @param entry - The application to record, without its position
 * @internal
 */
export function claimBinding(
  context: DecoratorContext,
  entry: Omit<BindingEntry, "consumed" | keyof SourcePosition>,
): void {
  const recorded: BindingEntry = {
    ...entry,
    ...sourcePositionOf(context.decoratorTarget),
    consumed: false,
  };
  const existing = getEntries(context.program, entry.target) ?? [];
  // One decorator application calls this function once, so the position is
  // the whole identity of an application. `useSecurity` and `@server` guard
  // their own reruns with the same test.
  if (existing.some((other) => isSameApplication(other, recorded))) return;
  existing.push(recorded);
  setEntries(context.program, entry.target, existing);
}

/**
 * Reads back every binding recorded on one target.
 *
 * The list is in the order the applications ran, which is not source order.
 * The builder sorts it.
 *
 * @param program - The program to read the state from
 * @param target - The type the decorators were applied to
 * @returns The recorded entries. The list is empty when the target carries
 * no binding.
 * @internal
 */
export function listBindings(program: Program, target: Type): readonly BindingEntry[] {
  return getEntries(program, target) ?? [];
}

/**
 * Reads back every binding the whole program recorded.
 *
 * Only the unattached-binding report needs this. It asks a question about
 * the program rather than about one target.
 *
 * @param program - The program to read the state from
 * @returns Every recorded entry, across every target
 * @internal
 */
export function listAllBindings(program: Program): BindingEntry[] {
  const all: BindingEntry[] = [];
  for (const entries of getEntryMap(program).values()) {
    all.push(...entries);
  }
  return all;
}

/**
 * Marks one entry as having reached an emitted object.
 *
 * @param entry - The entry the builder just rendered
 * @internal
 */
export function markBindingConsumed(entry: BindingEntry): void {
  entry.consumed = true;
}
