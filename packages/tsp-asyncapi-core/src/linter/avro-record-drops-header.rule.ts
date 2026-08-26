/**
 * An Avro record whose model marks a field as a message header.
 *
 * `tsp-avro` leaves a property marked `@header` out of the record it builds.
 * That is the right answer for the AsyncAPI document, where the property is
 * described beside the message rather than inside the payload. It is also the
 * right answer for the `.avsc` file, because the file and the payload then
 * describe the same fields.
 *
 * So nothing is wrong, and the walk says nothing. A project that also hands
 * those `.avsc` files to a schema registry may still want the list, because
 * the file has fewer fields than the model that produced it.
 *
 * ## Why this is not in `recommended`
 *
 * A rule there says the author probably did not mean what they wrote. An
 * AsyncAPI author who writes `@header` means exactly this: not in the
 * payload. Reporting it by default would name correct work as a mistake, on
 * every compile.
 */

import { createRule, paramMessage } from "@typespec/compiler";
import { isHeader, listMessages } from "../decorators/index.js";
import { listAvroRecordModels } from "../avro-state.js";

export const avroRecordDropsHeaderRule = createRule({
  name: "avro-record-drops-header",
  severity: "warning",
  description: "Report a @header property that an Avro record leaves out.",
  messages: {
    default: paramMessage`Property '${"name"}' of message '${"message"}' carries @header, so the Avro record of that message leaves it out. The .avsc file has one field fewer than the model that produced it. The AsyncAPI document describes the property beside the message.`,
  },
  create: (context) => ({
    root: () => {
      const program = context.program;
      const records = new Set(listAvroRecordModels(program));

      for (const [model] of listMessages(program)) {
        // Without the Avro decorator there is no record, so nothing is left
        // out of one.
        if (!records.has(model)) continue;

        for (const property of model.properties.values()) {
          if (!isHeader(program, property)) continue;

          context.reportDiagnostic({
            format: { name: property.name, message: model.name },
            target: property,
          });
        }
      }
    },
  }),
});
