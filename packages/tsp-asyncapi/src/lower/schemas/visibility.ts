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
 * Decides whether `prop` reaches the schema, and reports the case that
 * cannot be honoured.
 *
 * The active phase count is compared against the visibility class's own
 * member count, not a fixed list of phase names. A phase the standard
 * library adds later is then counted too, instead of marking every
 * property restricted.
 *
 * The warning is reported once per property, since a model reachable from
 * two messages is built twice.
 *
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
