/**
 * What the two content-type rules both have to ask.
 *
 * `protobuf-content-type-undeclared` and `avro-content-type-undeclared` state
 * the same shape twice: a media type names a binary format, a preview feature
 * renders that format, and the rule reports a message that names the one
 * without turning on the other. Only the media types and the feature name
 * differ, so the two questions live here and each rule keeps its own answers.
 *
 * The options read is the reason this matters. It indexes a record the
 * compiler does not type, so a change to how preview features are requested
 * has one place to reach, not two.
 */

import type { Program } from "@typespec/compiler";

/**
 * The key the emitter options sit under in `tspconfig.yaml`.
 *
 * That key is the emitter package's name. It is not this package's
 * `PACKAGE_NAME`, which names the core package and would read nothing, and it
 * is not `LIBRARY_NAME` either, although the two strings happen to agree
 * today. Naming it here says which of the three this is.
 */
const EMITTER_OPTIONS_KEY = "tsp-asyncapi";

/**
 * Whether this compilation turned one preview feature on.
 *
 * The linter runs before emit, so the options are read from the compilation
 * rather than from an emitter that has not started. An editor session with no
 * emitter configured reads no options and a rule stays quiet, which is the
 * same answer it gives a project that left the feature off.
 *
 * @param program - The compiled program
 * @param feature - The name a `preview-features` entry would carry
 * @returns Whether `preview-features` names it
 * @internal
 */
export function previewFeatureIsOn(program: Program, feature: string): boolean {
  const options = program.compilerOptions.options?.[EMITTER_OPTIONS_KEY];
  const requested = options?.["preview-features"];
  return Array.isArray(requested) && requested.includes(feature);
}

/**
 * Whether one content type names a media type in a set.
 *
 * A media type may carry parameters, such as `;version=3`, so the check reads
 * the type itself and ignores what follows the semicolon.
 *
 * @param contentType - The value the decorator recorded
 * @param mediaTypes - The media types that count, in lower case
 * @returns Whether the content type names one of them
 * @internal
 */
export function mediaTypeIsOneOf(contentType: string, mediaTypes: ReadonlySet<string>): boolean {
  const [mediaType] = contentType.split(";");
  return mediaTypes.has(mediaType.trim().toLowerCase());
}
