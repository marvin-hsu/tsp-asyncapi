/**
 * A message that says it carries Protobuf, and carries JSON Schema.
 *
 * `@contentType` states how the bytes on the wire are encoded. It does not
 * produce them. So a message can declare a Protobuf media type while its
 * payload is still lowered from the TypeSpec model, and the document then
 * contradicts itself: a consumer told to decode Protobuf would validate
 * those bytes against a JSON Schema.
 *
 * Two things make the payload Protobuf, and either one silences this rule.
 * `@rawPayload` carries the text the author wrote. The official
 * `@Protobuf.message` decorator carries the declarations the preview feature
 * renders from.
 *
 * ## Why the rule waits for the preview feature
 *
 * The remedy differs without it. A project with the feature off cannot reach
 * a generated payload at all, so the only answer there is `@rawPayload`, and
 * a project may be waiting for the feature on purpose. With the feature on,
 * `@Protobuf.message` is the answer the project asked for, and its absence
 * is an oversight rather than a choice.
 */

import { createRule, paramMessage, type Model } from "@typespec/compiler";
import { getContentType, getRawPayload, listMessages } from "../decorators/index.js";
import { listProtobufMessageModels } from "../protobuf-state.js";
import { mediaTypeIsOneOf, previewFeatureIsOn } from "./content-type-undeclared.js";

/**
 * The media types that mean Protobuf.
 *
 * A media type may carry parameters, and the check ignores them.
 */
const PROTOBUF_MEDIA_TYPES = new Set([
  "application/vnd.google.protobuf",
  "application/x-protobuf",
  "application/protobuf",
  "application/octet-stream+protobuf",
]);

/** The preview feature that renders a payload from the official decorators. */
const PROTOBUF_FEATURE = "protobuf";

export const protobufContentTypeUndeclaredRule = createRule({
  name: "protobuf-content-type-undeclared",
  severity: "warning",
  description:
    "Require a message with a Protobuf content type to declare where its Protobuf schema comes from.",
  messages: {
    default: paramMessage`Message '${"name"}' declares the content type '${"contentType"}', but nothing gives it a Protobuf payload. Its payload is lowered from the TypeSpec model, so the document would tell a consumer to decode Protobuf and then describe those bytes with a JSON Schema. Add @Protobuf.message and a @Protobuf.field on every property, or write the schema with @rawPayload.`,
  },
  create: (context) => ({
    root: () => {
      const program = context.program;
      if (!previewFeatureIsOn(program, PROTOBUF_FEATURE)) return;

      const declared = new Set<Model>(listProtobufMessageModels(program));

      for (const [model] of listMessages(program)) {
        const contentType = getContentType(program, model);
        if (contentType === undefined || !mediaTypeIsOneOf(contentType, PROTOBUF_MEDIA_TYPES))
          continue;

        // Either source of a Protobuf payload settles it. The author who
        // wrote the text has already answered the question this rule asks.
        if (declared.has(model) || getRawPayload(program, model) !== undefined) continue;

        context.reportDiagnostic({
          format: { name: model.name, contentType },
          target: model,
        });
      }
    },
  }),
});
