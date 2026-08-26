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
 * `@rawPayload` carries the schema the author wrote. The `@Avro.avroRecord`
 * decorator carries the declarations the preview feature renders from.
 *
 * ## Why the rule waits for the preview feature
 *
 * The remedy differs without it. A project with the feature off cannot reach
 * a generated payload at all, so the only answer there is `@rawPayload`, and
 * a project may be waiting for the feature on purpose. With the feature on,
 * `@Avro.avroRecord` is the answer the project asked for, and its absence is an
 * oversight rather than a choice.
 */

import { createRule, paramMessage, type Model } from "@typespec/compiler";
import { listAvroRecordModels } from "../avro-state.js";
import { getContentType, getRawPayload, listMessages } from "../decorators/index.js";
import { mediaTypeIsOneOf, previewFeatureIsOn } from "./content-type-undeclared.js";

/**
 * The media types that mean Avro.
 *
 * A media type may carry parameters, and the check ignores them. The three
 * types are the ones the AsyncAPI specification lists for Avro.
 */
const AVRO_MEDIA_TYPES = new Set([
  "application/vnd.apache.avro",
  "application/vnd.apache.avro+json",
  "application/vnd.apache.avro+yaml",
]);

/** The preview feature that renders a payload from the Avro decorators. */
const AVRO_FEATURE = "avro";

export const avroContentTypeUndeclaredRule = createRule({
  name: "avro-content-type-undeclared",
  severity: "warning",
  description:
    "Require a message with an Avro content type to declare where its Avro schema comes from.",
  messages: {
    default: paramMessage`Message '${"name"}' declares the content type '${"contentType"}', but nothing gives it an Avro payload. Its payload is lowered from the TypeSpec model, so the document would tell a consumer to decode Avro and then describe those bytes with a JSON Schema. Add @Avro.avroRecord, or write the schema with @rawPayload.`,
  },
  create: (context) => ({
    root: () => {
      const program = context.program;
      if (!previewFeatureIsOn(program, AVRO_FEATURE)) return;

      const declared = new Set<Model>(listAvroRecordModels(program));

      for (const [model] of listMessages(program)) {
        const contentType = getContentType(program, model);
        if (contentType === undefined || !mediaTypeIsOneOf(contentType, AVRO_MEDIA_TYPES)) continue;

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
