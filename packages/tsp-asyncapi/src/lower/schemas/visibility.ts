/**
 * What the visibility decorators mean for an AsyncAPI message.
 *
 * `@visibility` exists to give one model several shapes: a REST API hides a
 * server-assigned id on create and shows it on read. An AsyncAPI message has
 * no such phases. It is one shape, sent once. So there is no phase for this
 * emitter to pick, and `@typespec/json-schema`, the emitter closest to this
 * one, does not read visibility either.
 *
 * That leaves two cases, and they are not the same.
 *
 * `@invisible` says the property is in no phase at all. That statement needs
 * no phase to interpret, so it is honoured: the property is left out.
 *
 * `@visibility(Lifecycle.Read)` says the property belongs to some phases and
 * not others. Emitting it in full is the only thing this emitter can do, but
 * doing that in silence would leave the author believing a field was
 * restricted when the document shows it to everyone. So it is reported.
 */

import {
  Enum,
  ModelProperty,
  Program,
  getLifecycleVisibilityEnum,
  getVisibilityForClass,
} from "@typespec/compiler";
import { SchemaDiagnostics } from "./diagnostics.js";

/**
 * Decides whether `prop` reaches the schema, reporting the case that cannot
 * be honoured.
 *
 * The count of active phases is compared against the visibility class's own
 * member count, rather than against a fixed list of phase names. A phase added
 * to the standard library later is then counted too, instead of making every
 * property look restricted.
 *
 * The warning is reported once per property. One property is one decision by
 * the author, and a model reachable from two messages is built twice.
 *
 * @param program - The program the property belongs to
 * @param prop - The property whose visibility is read
 * @param diagnostics - Where the restricted-visibility warning is reported
 * @returns True when the property should be emitted, false when it is omitted
 * @internal
 */
export function shouldEmitProperty(
  program: Program,
  prop: ModelProperty,
  diagnostics: SchemaDiagnostics,
): boolean {
  const lifecycle: Enum = getLifecycleVisibilityEnum(program);
  const active = getVisibilityForClass(program, prop, lifecycle);
  if (active.size === 0) {
    return false;
  }
  if (active.size < lifecycle.members.size) {
    diagnostics.reportOnce({ code: "visibility-not-applied", target: prop }, "visibility");
  }
  return true;
}
