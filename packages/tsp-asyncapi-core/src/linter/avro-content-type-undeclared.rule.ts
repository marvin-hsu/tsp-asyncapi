/**
 * A message that says it carries Avro, and carries JSON Schema.
 *
 * `@contentType` states how the bytes on the wire are encoded. It does not
 * produce them. So a message can declare an Avro media type while its payload
 * is still lowered from the TypeSpec model, and the document then contradicts
 * itself: a consumer told to decode Avro would validate those bytes against a
 * JSON Schema.
 *
 * Two things make the payload Avro, and either one silences this rule.
 * `@rawPayload` carries the schema the author wrote. The `@Avro.record`
 * decorator carries the declarations the preview feature renders from.
 *
 * ## Why the rule waits for the preview feature
 *
 * The remedy differs without it. A project with the feature off cannot reach
 * a generated payload at all, so the only answer there is `@rawPayload`, and
 * a project may be waiting for the feature on purpose. With the feature on,
 * `@Avro.record` is the answer the project asked for, and its absence is an
 * oversight rather than a choice.
 */

import { createRule, paramMessage, type Model, type Program } from "@typespec/compiler";
import { listAvroRecordModels } from "../avro-state.js";
import { getContentType, getRawPayload, listMessages } from "../decorators/index.js";

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
 * The media types that mean Avro.
 *
 * A media type may carry parameters, such as `;version=1.9.0`, so the check
 * reads the type itself and ignores what follows the semicolon. The three
 * types are the ones the AsyncAPI specification lists for Avro.
 */
const AVRO_MEDIA_TYPES = new Set([
  "application/vnd.apache.avro",
  "application/vnd.apache.avro+json",
  "application/vnd.apache.avro+yaml",
]);

/** The preview feature that renders a payload from the Avro decorators. */
const AVRO_FEATURE = "avro";

/**
 * Whether one media type names Avro.
 *
 * @param contentType - The value the decorator recorded
 * @returns Whether it is one of the Avro media types
 */
function namesAvro(contentType: string): boolean {
  const [mediaType] = contentType.split(";");
  return AVRO_MEDIA_TYPES.has(mediaType.trim().toLowerCase());
}

/**
 * Whether this compilation turned the Avro preview feature on.
 *
 * The linter runs before emit, so the options are read from the compilation
 * rather than from an emitter that has not started. An editor session with no
 * emitter configured reads no options and the rule stays quiet, which is the
 * same answer it gives a project that left the feature off.
 *
 * @param program - The compiled program
 * @returns Whether `preview-features` names the Avro feature
 */
function avroFeatureIsOn(program: Program): boolean {
  const options = program.compilerOptions.options?.[EMITTER_OPTIONS_KEY];
  const requested = options?.["preview-features"];
  return Array.isArray(requested) && requested.includes(AVRO_FEATURE);
}

export const avroContentTypeUndeclaredRule = createRule({
  name: "avro-content-type-undeclared",
  severity: "warning",
  description:
    "Require a message with an Avro content type to declare where its Avro schema comes from.",
  messages: {
    default: paramMessage`Message '${"name"}' declares the content type '${"contentType"}', but nothing gives it an Avro payload. Its payload is lowered from the TypeSpec model, so the document would tell a consumer to decode Avro and then describe those bytes with a JSON Schema. Add @Avro.record, or write the schema with @rawPayload.`,
  },
  create: (context) => ({
    root: () => {
      const program = context.program;
      if (!avroFeatureIsOn(program)) return;

      const declared = new Set<Model>(listAvroRecordModels(program));

      for (const [model] of listMessages(program)) {
        const contentType = getContentType(program, model);
        if (contentType === undefined || !namesAvro(contentType)) continue;

        // Either source of an Avro payload settles it. The author who wrote
        // the schema has already answered the question this rule asks.
        if (declared.has(model) || getRawPayload(program, model) !== undefined) continue;

        context.reportDiagnostic({
          format: { name: model.name, contentType },
          target: model,
        });
      }
    },
  }),
});
