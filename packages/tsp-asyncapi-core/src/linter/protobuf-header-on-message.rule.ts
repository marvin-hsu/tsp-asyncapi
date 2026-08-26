/**
 * A `@Protobuf.message` model with a header among its fields.
 *
 * `@header` says a property travels beside the payload. A proto message has
 * no room for that idea, and the official Protobuf emitter requires a field
 * number on every property of a `@Protobuf.message`. So the two ways of
 * writing it both fail, in different places:
 *
 * - With `@Protobuf.field`, the field number names a place the generated
 *   payload leaves empty. The preview feature reports that as an error.
 * - Without it, the official emitter refuses the whole `.proto` file, and its
 *   advice is to add the field number. That advice leads to the case above.
 *
 * One rule covers both, so the author reads the real remedy first rather than
 * after a round trip. The remedy is `@headers(Model)`: a separate model holds
 * the headers, and the proto message describes the payload alone.
 *
 * ## Why the rule stays quiet in one case
 *
 * The preview feature reports an error for a property that carries both
 * decorators. This rule would then say the same thing about the same property
 * in the same place, and an author would read one mistake twice. So it skips
 * exactly the properties that error already covers.
 */

import { createRule, paramMessage, type Model } from "@typespec/compiler";
import { isHeader, listMessages } from "../decorators/index.js";
import { listProtobufMessageModels, protobufFieldIndexOf } from "../protobuf-state.js";
import { previewFeatureIsOn } from "./content-type-undeclared.js";

/** The preview feature that renders a payload from the official decorators. */
const PROTOBUF_FEATURE = "protobuf";

export const protobufHeaderOnMessageRule = createRule({
  name: "protobuf-header-on-message",
  severity: "warning",
  description: "Report a @header property on a model that carries @Protobuf.message.",
  messages: {
    default: paramMessage`Property '${"name"}' of message '${"message"}' carries @header, and the model carries @Protobuf.message. A header travels beside the payload, and every property of a proto message needs a field number, so the proto message and the payload cannot describe the same fields. Move the headers into their own model and point at it with @headers.`,
  },
  create: (context) => ({
    root: () => {
      const program = context.program;
      const featureIsOn = previewFeatureIsOn(program, PROTOBUF_FEATURE);
      const declared = new Set<Model>(listProtobufMessageModels(program));

      for (const [model] of listMessages(program)) {
        // Without the official decorator there is no proto message, so there
        // is nothing for the payload to disagree with.
        if (!declared.has(model)) continue;

        for (const property of model.properties.values()) {
          if (!isHeader(program, property)) continue;
          // The emitter reports an error for a header that carries the
          // decorator at all, so this rule steps aside for the same set.
          if (featureIsOn && protobufFieldIndexOf(program, property) !== undefined) continue;

          context.reportDiagnostic({
            format: { name: property.name, message: model.name },
            target: property,
          });
        }
      }
    },
  }),
});
