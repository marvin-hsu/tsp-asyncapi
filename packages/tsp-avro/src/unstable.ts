/**
 * The walk and the renderer, exported with no stability promise.
 *
 * An emitter in another package turns a TypeSpec model into an Avro schema by
 * calling this package rather than by walking the model again. A second walk
 * would drift from this one, and the two would disagree about a construct
 * neither author remembered.
 *
 * Nothing here is a semver promise. The main entry point is. These names sit
 * behind their own entry point so the two are told apart, which is what
 * `tsp-asyncapi-core` does with its semantic model for the same reason.
 *
 * There are three names and no more.
 *
 * `buildAvroRecordWithDiagnostics` collects what it refused instead of
 * reporting it. A caller that reported this library's diagnostics would show a
 * user codes from a package they never asked to emit, and two emitters over
 * one program would each report every refusal. So the caller reads the reason
 * and says it under its own name.
 *
 * `renderAvroSchema` answers with the JSON value rather than the text of a
 * file, because a caller that embeds a schema in another document has nothing
 * to do with a file.
 *
 * `AvroSchema` is what the first hands over and the second takes.
 */

export { buildAvroRecordWithDiagnostics } from "./walk/model.js";
export { renderAvroSchema } from "./render.js";
export type { AvroSchema } from "./types.js";
