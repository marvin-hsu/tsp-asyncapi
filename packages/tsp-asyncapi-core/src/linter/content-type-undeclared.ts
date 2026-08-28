/**
 * What the two content-type rules both have to ask.
 *
 * `protobuf-content-type-undeclared` and `avro-content-type-undeclared` share
 * the same shape: a media type names a binary format, a preview feature
 * renders that format, and the rule reports a message that names one
 * without turning on the other. Only the media types and the feature name
 * differ, so both questions live here and each rule keeps its own answers.
 *
 * The options read here indexes a record the compiler does not type, so a
 * change to how preview features are requested has one place to reach.
 */

import type { Program } from "@typespec/compiler";

/**
 * The key the emitter options sit under in `tspconfig.yaml`.
 *
 * That key is the emitter package's name, not this package's `PACKAGE_NAME`
 * or its `LIBRARY_NAME`, even though the latter two strings happen to agree
 * today.
 */
const EMITTER_OPTIONS_KEY = "tsp-asyncapi";

/**
 * Whether this compilation turned one preview feature on.
 *
 * The linter runs before emit, so the options come from the compilation, not
 * from an emitter that has not started. An editor session with no emitter
 * configured reads no options, so a rule stays quiet, the same answer a
 * project gets when it leaves the feature off.
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
 * A media type may carry parameters, such as `;version=3`. The check reads
 * only the part before the semicolon.
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
