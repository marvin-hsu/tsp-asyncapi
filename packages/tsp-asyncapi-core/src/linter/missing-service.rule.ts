/**
 * Warns when a program declares AsyncAPI content but names no service.
 *
 * A document is emitted either way. `resolveInfo` fills `info.title` and
 * `info.version` with `DEFAULT_DOCUMENT_TITLE` and `DEFAULT_INFO_VERSION`
 * when there is no service, because both fields are required and something
 * has to go there.
 *
 * Nothing reports that today. The author gets a document titled "AsyncAPI
 * Document" at version "0.0.0", and the two placeholder values look enough
 * like real ones to survive a review.
 */

import { createRule, listServices, paramMessage } from "@typespec/compiler";
import { listChannels, listMessages } from "../decorators/index.js";
import { DEFAULT_DOCUMENT_TITLE, DEFAULT_INFO_VERSION } from "../constants.js";

export const missingServiceRule = createRule({
  name: "missing-service",
  severity: "warning",
  description: "Require a `@service` declaration when a program declares AsyncAPI content.",
  messages: {
    default: paramMessage`This program declares AsyncAPI content but no \`@service\`. The emitted document falls back to the title "${"title"}" and the version "${"version"}". Add \`@service\` to the namespace that describes this application.`,
  },
  create: (context) => ({
    // Whole-program by nature. A service can be declared in any file, so no
    // per-type callback can tell that none exists.
    root: (program) => {
      if (listServices(program).length > 0) return;

      // The guard. A project that imports this library without describing an
      // application yet has nothing to warn about, and warning there would
      // train the author to ignore the rule.
      const channels = listChannels(program);
      const messages = listMessages(program);
      if (channels.size === 0 && messages.size === 0) return;

      // A real target, always. The compiler drops a rule diagnostic whose
      // target is `NoTarget`, so a fallback to it reports nothing at all.
      // The guard above proves one of these two maps has an entry, and both
      // are in source order, so this is the first thing the author wrote
      // that made the document an AsyncAPI document.
      const target = channels.keys().next().value ?? messages.keys().next().value;
      if (target === undefined) return;

      context.reportDiagnostic({
        format: { title: DEFAULT_DOCUMENT_TITLE, version: DEFAULT_INFO_VERSION },
        target,
      });
    },
  }),
});
