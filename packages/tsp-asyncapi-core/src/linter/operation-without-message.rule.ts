/**
 * Warns when an operation names no message, which silently claims them all.
 *
 * An operation object carries a `messages` field listing what travels over
 * it. `resolveMessageRefs` drops every model that describes no emitted
 * message, and it says so: such a model is a payload or a channel parameter,
 * not a message. When nothing survives, the field is left out.
 *
 * Leaving it out is not the same as an empty list. AsyncAPI reads an
 * operation with no `messages` as **every message of the channel**. An empty
 * array would say the opposite. So an operation the author meant to carry
 * one message, written without a model that `@message` marks, ends up
 * claiming every message its channel carries.
 *
 * Nothing reports that. The document is valid, and it says the opposite of
 * what the author wrote.
 *
 * ## Why the three conditions
 *
 * The operation has an action. Without `@send` or `@receive` it emits no
 * operation object at all, so there is no `messages` field to be wrong.
 *
 * The operation belongs to a channel that was declared. An operation with an
 * action and no channel is already reported by `operation-without-channel`.
 *
 * The channel carries at least one message. "Every message of the channel"
 * is only a wrong claim when there are messages to claim. A channel with
 * none is reported by `channel-no-messages`, which gives the better advice
 * there.
 */

import { createRule, paramMessage, type Model } from "@typespec/compiler";
import { getChannel, getOperationAction, listMessages } from "../decorators/index.js";
import { owningChannelTarget } from "../resolve/channels/scope.js";
import { channelMessageModels, operationSides } from "../resolve/operation-models.js";

export const operationWithoutMessageRule = createRule({
  name: "operation-without-message",
  severity: "warning",
  description: "Require an operation to name at least one `@message` model.",
  messages: {
    default: paramMessage`Operation '${"name"}' names no \`@message\` model, so the emitted operation carries no \`messages\` field. AsyncAPI reads that as every message of channel '${"channel"}'. Mark the model this operation carries with \`@message\`.`,
  },
  create: (context) => ({
    operation: (operation) => {
      const program = context.program;

      const action = getOperationAction(program, operation)?.action;
      if (action === undefined) return;

      const target = owningChannelTarget(operation);
      if (target === undefined) return;
      const channel = getChannel(program, target);
      if (channel === undefined) return;

      // The direction rule has one definition, in `operation-models.ts`.
      // Which side is the request and which is the reply depends on the
      // action, and a second spelling of that here would let the rule and
      // the emitter disagree about one operation.
      //
      // Those sides hold every model the signature names, message or not.
      // `resolveMessageRefs` applies the message filter downstream, so the
      // same filter is applied here rather than assumed.
      const messages = listMessages(program);
      const { request, reply } = operationSides(program, operation, action);
      const carries = (model: Model) => messages.has(model);
      if (request.some(carries) || reply.some(carries)) return;

      if (channelMessageModels(program, target).length === 0) return;

      const id = channel.channelId ?? channel.address ?? target.name;

      context.reportDiagnostic({
        format: { name: operation.name, channel: id },
        target: operation,
      });
    },
  }),
});
