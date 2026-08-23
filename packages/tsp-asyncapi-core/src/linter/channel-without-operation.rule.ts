/**
 * Warns when a channel describes messages that nothing sends or receives.
 *
 * A channel reaches the document from `@channel`, and its `messages` map is
 * read off the signatures of the operations around it. `@send` and
 * `@receive` are what put an operation into the document's `operations` map.
 * Neither is required for a message to reach the channel.
 *
 * So an author who writes the operations and forgets the two decorators gets
 * a document that names a channel and its messages, and says nothing about
 * who publishes or subscribes. The document is valid. It describes no
 * traffic.
 *
 * ## Why the three conditions
 *
 * The rule stays quiet unless all three hold, and each one rules out a
 * document that is correct as written.
 *
 * A channel with no messages at all is already reported by
 * `channel-no-messages`, and that diagnostic gives the better advice: the
 * author most likely forgot `@message`. Two warnings on one channel pointing
 * two ways is worse than one.
 *
 * A reply channel legitimately owns no operation. `@replyChannel` names a
 * channel from an operation declared elsewhere, and the messages reach it
 * from there. Reporting it would fire on every request-reply document.
 */

import { createRule, paramMessage } from "@typespec/compiler";
import { getChannel, listChannels, getOperationAction } from "../decorators/index.js";
import { listOperationsReplyingOver } from "../decorators/operations/reply-state.js";
import { channelOperations } from "../resolve/channels/scope.js";
import { channelMessageModels } from "../resolve/operation-models.js";

export const channelWithoutOperationRule = createRule({
  name: "channel-without-operation",
  severity: "warning",
  description: "Require a channel to carry an operation marked `@send` or `@receive`.",
  messages: {
    default: paramMessage`Channel '${"id"}' carries messages but no operation marked \`@send\` or \`@receive\`, so the emitted document says nothing about who publishes or subscribes. Add \`@send\` or \`@receive\` to the operations on this channel.`,
  },
  create: (context) => ({
    // Whole-program, because `listChannels` is how a channel target is found.
    // A per-interface callback would miss a channel on a namespace, and
    // walking both kinds separately would restate the scope rule.
    root: (program) => {
      for (const target of listChannels(program).keys()) {
        // The scope rule has one definition, in `resolve/channels/scope.ts`.
        // A nested interface is a separate scope, and re-deriving that here
        // would be the same decision implemented twice.
        const operations = channelOperations(program, target);
        if (operations.some((operation) => getOperationAction(program, operation) !== undefined)) {
          continue;
        }

        if (listOperationsReplyingOver(program, target).length > 0) continue;
        if (channelMessageModels(program, target).length === 0) continue;

        const channel = getChannel(program, target);
        if (channel === undefined) continue;

        // The same key `resolve/channels.ts` gives the document. A
        // `@dynamicChannel` has no address, so naming it by address would
        // print "null" at the one place the author needs to recognise which
        // channel this is.
        const id = channel.channelId ?? channel.address ?? target.name;

        context.reportDiagnostic({
          format: { id },
          target,
        });
      }
    },
  }),
});
