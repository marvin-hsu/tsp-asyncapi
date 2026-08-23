import { describe, it } from "vitest";
import { channelWithoutOperationRule } from "#core/linter/channel-without-operation.rule.js";
import { createRuleTester } from "../../utils/linter.js";

const SERVICE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @message
  model OrderCreated {
    id: string;
  }
`;

/**
 * Unit tests of `tsp-asyncapi/channel-without-operation`.
 *
 * The rule fires on a channel that carries messages but nothing that sends
 * or receives them. Most of these cases are about the three conditions that
 * keep it quiet, because each one guards a document that is correct as
 * written.
 */
describe("Unit: the channel-without-operation rule", () => {
  it("stays quiet when an operation is marked @send", async () => {
    const tester = await createRuleTester(channelWithoutOperationRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(event: OrderCreated): void;
        }
      `,
      )
      .toBeValid();
  });

  it("stays quiet when an operation is marked @receive", async () => {
    const tester = await createRuleTester(channelWithoutOperationRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @receive
          op consume(event: OrderCreated): void;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * The mistake the rule is for. The operation carries the message to the
   * channel with or without the decorator, so the channel and its messages
   * are emitted and the `operations` map stays empty.
   */
  it("reports a channel whose operations carry neither decorator", async () => {
    const tester = await createRuleTester(channelWithoutOperationRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          op publish(event: OrderCreated): void;
        }
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/channel-without-operation" });
  });

  /**
   * A channel with no messages belongs to `channel-no-messages`, which tells
   * the author to look at `@message`. Firing here as well would put two
   * warnings on one channel pointing two different ways.
   */
  it("stays quiet when the channel carries no messages at all", async () => {
    const tester = await createRuleTester(channelWithoutOperationRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @channel("orders.created")
        interface OrderChannel {
          op publish(id: string): void;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * A reply channel owns no operation by design. The messages reach it from
   * the operation that names it with `@replyChannel`, declared elsewhere.
   * This is the case that would fire on every request-reply document.
   */
  it("stays quiet on a channel that only receives replies", async () => {
    const tester = await createRuleTester(channelWithoutOperationRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @message
        model OrderCommand {
          id: string;
        }

        @message
        model OrderResult {
          ok: boolean;
        }

        @channel("orders.replies")
        interface ReplyChannel {}

        @channel("orders.commands")
        interface CommandChannel {
          @send
          @replyChannel(ReplyChannel)
          op submit(command: OrderCommand): OrderResult;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * A nested interface is a separate scope, so the operation inside it does
   * not belong to the outer namespace's channel. The rule reads that scope
   * from `resolve/channels/scope.ts` rather than re-deriving it, and this
   * case pins that it did.
   */
  it("does not count an operation from a nested interface", async () => {
    const tester = await createRuleTester(channelWithoutOperationRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        namespace OuterChannel {
          op carry(event: OrderCreated): void;

          interface Inner {
            @send
            op publish(event: OrderCreated): void;
          }
        }
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/channel-without-operation" });
  });
});
