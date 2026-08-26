/**
 * A property that is both a header and a Protobuf field.
 *
 * `@header` says the field travels beside the payload, not inside it.
 * `@Protobuf.field` says it is field N of the proto message. Both are on one
 * property, and both are true of a different artifact: the `.proto` file the
 * official emitter writes declares the field, and the AsyncAPI payload does
 * not carry it.
 *
 * So the two files disagree about the same message, and neither one is wrong
 * on its own terms. The author almost never means that.
 *
 * ## Why this rule does not wait for the preview feature
 *
 * The disagreement does not come from the feature. The `.proto` file comes
 * from the official emitter, which runs whether or not this emitter renders a
 * Protobuf payload, and the lifted header leaves the AsyncAPI payload either
 * way. Turning the feature on makes the payload Protobuf as well, which
 * sharpens the contradiction into an error, but it does not create it.
 *
 * The remedy is `@headers(Model)`. A separate model holds the headers, so the
 * proto message and the payload describe the same fields again.
 */

import { createRule, paramMessage, type Model } from "@typespec/compiler";
import { isHeader, listMessages } from "../decorators/index.js";
import { listProtobufMessageModels, protobufFieldIndexOf } from "../protobuf-state.js";

export const protobufFieldOnHeaderRule = createRule({
  name: "protobuf-field-on-header",
  severity: "warning",
  description: "Report a property that carries both @header and @Protobuf.field.",
  messages: {
    default: paramMessage`Property '${"name"}' of message '${"message"}' carries both @header and @Protobuf.field. The proto message declares it as a field, and the AsyncAPI payload leaves it out, so the two describe different shapes. Move the headers into their own model and point at it with @headers.`,
  },
  create: (context) => ({
    root: () => {
      const program = context.program;
      const declared = new Set<Model>(listProtobufMessageModels(program));

      for (const [model] of listMessages(program)) {
        // Without the official decorator there is no proto message, so there
        // is nothing for the payload to disagree with.
        if (!declared.has(model)) continue;

        for (const property of model.properties.values()) {
          if (!isHeader(program, property)) continue;
          if (protobufFieldIndexOf(program, property) === undefined) continue;

          context.reportDiagnostic({
            format: { name: property.name, message: model.name },
            target: property,
          });
        }
      }
    },
  }),
});
