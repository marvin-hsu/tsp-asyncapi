import { describe, it } from "vitest";
import { missingServiceRule } from "#core/linter/missing-service.rule.js";
import { createRuleTester } from "../../utils/linter.js";

/**
 * Unit tests of `tsp-asyncapi/missing-service`.
 *
 * The rule exists because a program with no `@service` still emits a
 * document, and `resolveInfo` fills the two required `info` fields with
 * placeholders. Nothing else reports that.
 */
describe("Unit: the missing-service rule", () => {
  it("stays quiet when a service is declared", async () => {
    const tester = await createRuleTester(missingServiceRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @message
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(event: OrderCreated): void;
        }
      `,
      )
      .toBeValid();
  });

  it("reports a program that declares a channel but no service", async () => {
    const tester = await createRuleTester(missingServiceRule);
    await tester
      .expect(
        `
        namespace Test;

        @message
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(event: OrderCreated): void;
        }
      `,
      )
      // The full id, not just the message. The prefix is the contract this
      // rule set is configured by, and a test that checks only the message
      // would let it drift to `tsp-asyncapi-core/missing-service`.
      .toEmitDiagnostics({ code: "tsp-asyncapi/missing-service" });
  });

  /**
   * The guard. A file that imports the library without describing an
   * application is the normal state of a project mid-edit, and warning there
   * would train the author to ignore the rule.
   */
  it("stays quiet when the program declares no AsyncAPI content", async () => {
    const tester = await createRuleTester(missingServiceRule);
    await tester
      .expect(
        `
        namespace Test;

        model NotAMessage {
          id: string;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * A message with no channel still counts as AsyncAPI content, so the rule
   * fires. It has no channel to point at, so this case also pins that the
   * fallback target does not throw.
   */
  it("reports a program with a message but no channel", async () => {
    const tester = await createRuleTester(missingServiceRule);
    await tester
      .expect(
        `
        namespace Test;

        @message
        model OrderCreated {
          id: string;
        }
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/missing-service" });
  });

  /**
   * One warning for the whole program, not one per channel.
   *
   * The rule runs from `root`, so a per-channel loop would be an easy
   * mistake to make later. Passing a single match asserts the count as well
   * as the code.
   *
   * Where the warning lands is proved end to end rather than here: compiling
   * `examples/01-hello-world` with the rule on puts it at `main.tsp:42:11`,
   * on the channel interface.
   */
  it("reports once when the program declares two channels", async () => {
    const tester = await createRuleTester(missingServiceRule);
    await tester
      .expect(
        `
        namespace Test;

        @message
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        interface FirstChannel {
          @send
          op publish(event: OrderCreated): void;
        }

        @channel("orders.shipped")
        interface SecondChannel {
          @send
          op ship(event: OrderCreated): void;
        }
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/missing-service" });
  });
});
