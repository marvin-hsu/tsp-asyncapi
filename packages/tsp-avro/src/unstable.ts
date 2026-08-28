/**
 * The walk and the renderer, exported with no stability promise.
 *
 * An emitter in another package builds an Avro schema by calling this
 * package rather than walking the model again itself. Two independent
 * walks would drift and disagree about a construct neither author
 * remembered.
 *
 * Nothing here is a semver promise; the main entry point is. These names
 * sit behind their own entry point so the two stay distinguishable, the
 * way `tsp-asyncapi-core` separates its semantic model for the same reason.
 *
 * `buildAvroRecordWithDiagnostics` collects what it refused instead of
 * reporting it, so the caller reports each refusal under its own name
 * rather than surfacing this package's diagnostic codes, and two emitters
 * over one program do not each report the same refusal.
 *
 * `renderAvroSchema` answers with the JSON value rather than file text, for
 * a caller that embeds the schema in another document.
 *
 * `AvroSchema` is what the first hands over and the second takes.
 */

export { buildAvroRecordWithDiagnostics } from "./walk/model.js";
export { renderAvroSchema } from "./render.js";
export type { AvroSchema } from "./types.js";
