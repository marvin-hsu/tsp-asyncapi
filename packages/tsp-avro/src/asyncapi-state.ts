/**
 * Reading the decorator state of the AsyncAPI library.
 *
 * Avro has no notion of a message header. AsyncAPI does, and `@header` says a
 * property travels beside the payload rather than inside it. A record that
 * declared such a property would describe a field the message does not carry
 * there, and the schema file and the document would disagree.
 *
 * So this library asks one question about a property: did the author mark it
 * as a message header? It asks without a dependency on `tsp-asyncapi-core`.
 * This library stands on its own, and a project that never writes an AsyncAPI
 * decorator gets `false` for every property. The compiler builds every state
 * symbol with `Symbol.for`, from the library name and the key, so the same
 * symbol comes back from the global registry.
 *
 * The key name and the shape behind it are not covered by any compatibility
 * promise of that library. This file is the only place that reads them, so an
 * upgrade has one place to check.
 *
 * ## What this does not read
 *
 * `@headers` and `@rawHeaders` describe the whole headers object elsewhere,
 * and a message that declares one of them alongside a field-level `@header`
 * is a conflict the AsyncAPI emitter reports. That emitter then keeps the
 * marked fields in the payload, and a record built here still leaves them
 * out. Replicating the rule that decides it would put one rule in two
 * packages, which is the drift this file exists to avoid. The conflict is an
 * error either way, so an author reaches it with something to fix.
 */

import type { ModelProperty, Program } from "@typespec/compiler";

/** The state key of `@AsyncAPI.header`, a set of the properties that carry it. */
const HEADER_STATE = Symbol.for("tsp-asyncapi.header");

/**
 * Whether the author marked one property as a message header.
 *
 * @param program - The compiled program
 * @param property - The property to ask about
 * @returns Whether the decorator marked it
 *
 * @internal
 */
export function isAsyncAPIHeader(program: Program, property: ModelProperty): boolean {
  return program.stateSet(HEADER_STATE).has(property);
}
